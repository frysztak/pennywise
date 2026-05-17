package ihatemoney

import (
	"fmt"
	"math"
	"pennywise/db/database"
	"pennywise/db/overrides"
	"sort"
	"time"

	"github.com/google/uuid"
)

// Plan is the immutable output of Build. Apply walks it once and writes
// every row inside a single transaction.
type Plan struct {
	GroupID    string
	Group      database.CreateGroupParams
	Currencies []string // distinct currencies seen in bills + default; used for group_currencies
	Members    []database.AddUserToGroupParams
	Expenses   []PlannedExpense
	Transfers  []database.CreateTransferParams
	Warnings   []string
}

// PlannedExpense bundles every row that makes up one Pennywise expense:
// the expense itself, exactly one payer row, and N beneficiary rows.
type PlannedExpense struct {
	Expense       database.CreateExpenseParams
	Payer         database.CreateExpensePayerParams
	Beneficiaries []string // pennywise user IDs
}

// BuildOptions tweaks transformation behavior.
type BuildOptions struct {
	// StrictReimbursement rejects (rather than fans out) multi-ower
	// reimbursements. Default false matches ihatemoney's own settlement
	// math, splitting by ower weight across multiple Pennywise transfers.
	StrictReimbursement bool
	// Now is the clock used for created_at on derived rows that don't
	// have a source equivalent (group, group memberships). Defaults to
	// time.Now() when zero.
	Now time.Time
}

// Build runs the full pure transformation. It performs no I/O. All Pennywise
// IDs are freshly generated UUIDs; the original ihatemoney IDs are discarded.
func Build(
	project *Project,
	persons []Person,
	bills []Bill,
	owers map[int64][]int64,
	resolved *Resolved,
	opts BuildOptions,
) (*Plan, error) {
	if opts.Now.IsZero() {
		opts.Now = time.Now().UTC()
	}

	plan := &Plan{
		GroupID: uuid.NewString(),
	}

	name := project.Name
	if resolved.Mapping.ProjectName != "" {
		name = resolved.Mapping.ProjectName
	}
	emptyDesc := ""
	plan.Group = database.CreateGroupParams{
		ID:              plan.GroupID,
		CreatedBy:       resolved.Mapping.CreatorUserID,
		CreatedAt:       overrides.TextTime{Time: opts.Now},
		DefaultCurrency: project.DefaultCurrency,
		Name:            name,
		Description:     &emptyDesc,
	}

	// Members — preserve source order so plan output is stable.
	personWeight := make(map[int64]float64, len(persons))
	for _, p := range persons {
		personWeight[p.ID] = p.Weight
		if !p.Activated {
			plan.Warnings = append(plan.Warnings,
				fmt.Sprintf("person %q (id=%d) is deactivated in source; importing as active member",
					p.Name, p.ID))
		}
		u, ok := resolved.UsersByIHM[p.ID]
		if !ok {
			// Should have been caught in Validate, but guard anyway.
			return nil, fmt.Errorf("internal: no resolved user for person id %d", p.ID)
		}
		plan.Members = append(plan.Members, database.AddUserToGroupParams{
			UserID:  u.ID,
			GroupID: plan.GroupID,
			Weight:  p.Weight,
			AddedAt: overrides.TextTime{Time: opts.Now},
		})
	}

	// Track distinct currencies for group_currencies.
	currencySet := map[string]struct{}{project.DefaultCurrency: {}}

	for _, b := range bills {
		currency := b.OriginalCurrency
		if currency == "" {
			currency = project.DefaultCurrency
			plan.Warnings = append(plan.Warnings,
				fmt.Sprintf("bill %d (%q): no original_currency, defaulted to %s",
					b.ID, b.What, project.DefaultCurrency))
		}
		currencySet[currency] = struct{}{}

		amountCents, warn := toCents(b.Amount)
		if warn != "" {
			plan.Warnings = append(plan.Warnings,
				fmt.Sprintf("bill %d (%q): %s", b.ID, b.What, warn))
		}

		payerUser, ok := resolved.UsersByIHM[b.PayerID]
		if !ok {
			return nil, fmt.Errorf("bill %d: payer person id %d not in mapping", b.ID, b.PayerID)
		}

		owerIDs := owers[b.ID]
		if len(owerIDs) == 0 {
			plan.Warnings = append(plan.Warnings,
				fmt.Sprintf("bill %d (%q): has no owers; skipping", b.ID, b.What))
			continue
		}

		switch b.BillType {
		case BillTypeReimbursement:
			transfers, err := buildReimbursement(b, owerIDs, personWeight, resolved,
				plan.GroupID, payerUser, currency, amountCents, opts)
			if err != nil {
				return nil, err
			}
			plan.Transfers = append(plan.Transfers, transfers...)

		default: // EXPENSE
			ex, err := buildExpense(b, owerIDs, resolved,
				plan.GroupID, payerUser, currency, amountCents)
			if err != nil {
				return nil, err
			}
			plan.Expenses = append(plan.Expenses, ex)
		}
	}

	plan.Currencies = make([]string, 0, len(currencySet))
	for c := range currencySet {
		plan.Currencies = append(plan.Currencies, c)
	}
	sort.Strings(plan.Currencies)

	return plan, nil
}

// toCents converts a float amount to integer cents with a sanity check.
// SQLAlchemy floats from ihatemoney are usually clean to 2dp, but we
// surface anything that rounds off by more than 0.001¢ for operator review.
func toCents(amount float64) (int64, string) {
	scaled := amount * 100
	rounded := math.Round(scaled)
	if math.Abs(scaled-rounded) > 0.001 {
		return int64(rounded), fmt.Sprintf(
			"amount %f rounded to %d cents (delta %.6f)", amount, int64(rounded), scaled-rounded)
	}
	return int64(rounded), ""
}

func buildExpense(
	b Bill,
	owerIDs []int64,
	resolved *Resolved,
	groupID string,
	payer ResolvedUser,
	currency string,
	amountCents int64,
) (PlannedExpense, error) {
	beneficiaries := make([]string, 0, len(owerIDs))
	for _, oid := range owerIDs {
		u, ok := resolved.UsersByIHM[oid]
		if !ok {
			return PlannedExpense{}, fmt.Errorf("bill %d: ower person id %d not in mapping", b.ID, oid)
		}
		beneficiaries = append(beneficiaries, u.ID)
	}

	expenseID := uuid.NewString()
	return PlannedExpense{
		Expense: database.CreateExpenseParams{
			ID:        expenseID,
			CreatedAt: overrides.TextTime{Time: b.CreationDate},
			Date:      overrides.TextTime{Time: b.Date},
			GroupID:   groupID,
			Name:      b.What,
			Currency:  currency,
		},
		Payer: database.CreateExpensePayerParams{
			ID:        uuid.NewString(),
			ExpenseID: expenseID,
			UserID:    payer.ID,
			Amount:    amountCents,
		},
		Beneficiaries: beneficiaries,
	}, nil
}

// buildReimbursement turns an ihatemoney REIMBURSEMENT bill into one or
// more Pennywise transfers. Multi-ower reimbursements are split by ower
// weight (matching ihatemoney's settlement formula); rounding remainders
// are placed on the first ower so the cents sum exactly equals the source.
func buildReimbursement(
	b Bill,
	owerIDs []int64,
	personWeight map[int64]float64,
	resolved *Resolved,
	groupID string,
	payer ResolvedUser,
	currency string,
	amountCents int64,
	opts BuildOptions,
) ([]database.CreateTransferParams, error) {
	if len(owerIDs) == 1 {
		recv, ok := resolved.UsersByIHM[owerIDs[0]]
		if !ok {
			return nil, fmt.Errorf("bill %d: ower person id %d not in mapping", b.ID, owerIDs[0])
		}
		return []database.CreateTransferParams{{
			ID:         uuid.NewString(),
			CreatedAt:  overrides.TextTime{Time: b.CreationDate},
			Date:       overrides.TextTime{Time: b.Date},
			GroupID:    groupID,
			SenderID:   payer.ID,
			ReceiverID: recv.ID,
			Amount:     amountCents,
			Currency:   currency,
		}}, nil
	}

	if opts.StrictReimbursement {
		return nil, fmt.Errorf("bill %d: multi-ower reimbursement rejected under --strict-reimbursement", b.ID)
	}

	// Weight-based split. Weights default to 1.0 in ihatemoney so this
	// degrades to an equal split when nothing has been customized.
	totalWeight := 0.0
	for _, oid := range owerIDs {
		totalWeight += personWeight[oid]
	}
	if totalWeight <= 0 {
		return nil, fmt.Errorf("bill %d: total ower weight is %f", b.ID, totalWeight)
	}

	transfers := make([]database.CreateTransferParams, 0, len(owerIDs))
	allocated := int64(0)
	for i, oid := range owerIDs {
		recv, ok := resolved.UsersByIHM[oid]
		if !ok {
			return nil, fmt.Errorf("bill %d: ower person id %d not in mapping", b.ID, oid)
		}
		var share int64
		if i == len(owerIDs)-1 {
			// Last ower absorbs any rounding remainder so the sum is exact.
			share = amountCents - allocated
		} else {
			share = int64(math.Round(float64(amountCents) * personWeight[oid] / totalWeight))
			allocated += share
		}
		if share <= 0 {
			continue
		}
		transfers = append(transfers, database.CreateTransferParams{
			ID:         uuid.NewString(),
			CreatedAt:  overrides.TextTime{Time: b.CreationDate},
			Date:       overrides.TextTime{Time: b.Date},
			GroupID:    groupID,
			SenderID:   payer.ID,
			ReceiverID: recv.ID,
			Amount:     share,
			Currency:   currency,
		})
	}
	return transfers, nil
}
