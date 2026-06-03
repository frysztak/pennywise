package splitwise

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"time"

	"github.com/google/uuid"

	"pennywise/db/database"
	"pennywise/db/overrides"
	"pennywise/migrate"
)

// build is the pure transformation from parsed CSV data to a migrate.Plan.
// It performs no I/O. All Pennywise IDs are freshly generated UUIDs.
func build(
	projectName string,
	defaultCurrency string,
	members []string,
	expenses []expenseRow,
	resolved *migrate.Resolved,
	opts migrate.BuildOptions,
) (*migrate.Plan, error) {
	now := opts.Now
	if now.IsZero() {
		now = time.Now().UTC()
	}

	name := projectName
	if resolved.Mapping.ProjectName != "" {
		name = resolved.Mapping.ProjectName
	}
	emptyDesc := ""
	groupID := uuid.NewString()
	plan := &migrate.Plan{
		GroupID: groupID,
		Group: database.CreateGroupParams{
			ID:              groupID,
			CreatedBy:       resolved.Mapping.CreatorUserID,
			CreatedAt:       overrides.TextTime{Time: now},
			DefaultCurrency: defaultCurrency,
			Name:            name,
			Description:     &emptyDesc,
		},
	}

	// Members — all equal weight; Splitwise CSV does not export per-member weights.
	for i, memberName := range members {
		u, ok := resolved.UsersBySource[strconv.Itoa(i)]
		if !ok {
			return nil, fmt.Errorf("internal: no resolved user for member %q (index %d)", memberName, i)
		}
		plan.Members = append(plan.Members, database.AddUserToGroupParams{
			UserID:  u.ID,
			GroupID: groupID,
			Weight:  1.0,
			AddedAt: overrides.TextTime{Time: now},
		})
	}

	currencySet := map[string]struct{}{defaultCurrency: {}}

	for _, row := range expenses {
		currencySet[row.Currency] = struct{}{}

		// Payer: the member whose share is most positive (they paid more than their split).
		payerIdx := -1
		maxShare := 0.0
		extraPayers := 0
		for i, s := range row.Shares {
			if s > 1e-6 {
				if s > maxShare {
					if payerIdx != -1 {
						extraPayers++
					}
					maxShare = s
					payerIdx = i
				} else {
					extraPayers++
				}
			}
		}
		if payerIdx == -1 {
			plan.Warnings = append(plan.Warnings,
				fmt.Sprintf("expense %q (%s): no payer found (no positive share); skipping",
					row.Description, row.Date.Format("2006-01-02")))
			continue
		}
		if extraPayers > 0 {
			plan.Warnings = append(plan.Warnings,
				fmt.Sprintf("expense %q (%s): %d additional positive shares detected; treating %q as sole payer",
					row.Description, row.Date.Format("2006-01-02"), extraPayers, members[payerIdx]))
		}

		payerUser, ok := resolved.UsersBySource[strconv.Itoa(payerIdx)]
		if !ok {
			return nil, fmt.Errorf("expense %q: payer %q (index %d) not in mapping",
				row.Description, members[payerIdx], payerIdx)
		}

		amountCents, warn := toCents(row.Amount)
		if warn != "" {
			plan.Warnings = append(plan.Warnings,
				fmt.Sprintf("expense %q: %s", row.Description, warn))
		}

		// Beneficiaries: members whose effective share of the cost is positive.
		// For the payer:   effective_share = row.Amount - net  (net is positive)
		// For others:      effective_share = -net              (net is negative when they owe)
		var beneficiaries []string
		for i, net := range row.Shares {
			var share float64
			if i == payerIdx {
				share = row.Amount - net
			} else {
				share = -net
			}
			if share > 1e-6 {
				u, ok := resolved.UsersBySource[strconv.Itoa(i)]
				if !ok {
					return nil, fmt.Errorf("expense %q: member %q (index %d) not in mapping",
						row.Description, members[i], i)
				}
				beneficiaries = append(beneficiaries, u.ID)
			}
		}
		if len(beneficiaries) == 0 {
			plan.Warnings = append(plan.Warnings,
				fmt.Sprintf("expense %q (%s): no beneficiaries found; skipping",
					row.Description, row.Date.Format("2006-01-02")))
			continue
		}

		expenseID := uuid.NewString()
		plan.Expenses = append(plan.Expenses, migrate.PlannedExpense{
			Expense: database.CreateExpenseParams{
				ID:        expenseID,
				CreatedAt: overrides.TextTime{Time: row.Date},
				Date:      overrides.TextTime{Time: row.Date},
				GroupID:   groupID,
				Name:      row.Description,
				Currency:  row.Currency,
			},
			Payer: database.CreateExpensePayerParams{
				ID:        uuid.NewString(),
				ExpenseID: expenseID,
				UserID:    payerUser.ID,
				Amount:    amountCents,
			},
			Beneficiaries: beneficiaries,
		})
	}

	plan.Currencies = make([]string, 0, len(currencySet))
	for c := range currencySet {
		plan.Currencies = append(plan.Currencies, c)
	}
	sort.Strings(plan.Currencies)

	return plan, nil
}

// toCents converts a float amount to integer cents. Amounts that don't round
// cleanly to 2 decimal places get a warning so operators can review the delta.
func toCents(amount float64) (int64, string) {
	scaled := amount * 100
	rounded := math.Round(scaled)
	if math.Abs(scaled-rounded) > 0.001 {
		return int64(rounded), fmt.Sprintf(
			"amount %f rounded to %d cents (delta %.6f)", amount, int64(rounded), scaled-rounded)
	}
	return int64(rounded), ""
}
