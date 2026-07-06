package calc

import (
	"maps"
	"math"
	"pennywise/db/database"
	"pennywise/utils"
	"sort"
	"time"
)

// ComputeMemberSpending returns two per-user, per-currency balances (in cents):
//   - paid:  the sum of expense amounts where the user is the payer
//   - share: the sum of the user's weighted beneficiary shares across all expenses
//
// Both accumulate in float cents and round once at the end, mirroring
// ComputeGroupBalance so the figures line up with the displayed balances.
func ComputeMemberSpending(
	members *[]database.GetGroupMembersRow,
	expenses *[]database.GetGroupExpensesRow,
) (paid GroupBalance, share GroupBalance) {

	userWeights := make(map[string]float64, len(*members))
	for _, m := range *members {
		userWeights[m.UserID] = m.Weight
	}

	paidFloat := make(map[string]map[string]float64, len(userWeights))
	shareFloat := make(map[string]map[string]float64, len(userWeights))
	for userID := range userWeights {
		paidFloat[userID] = make(map[string]float64)
		shareFloat[userID] = make(map[string]float64)
	}

	for _, e := range *expenses {
		if paidFloat[e.PayerID] == nil {
			paidFloat[e.PayerID] = make(map[string]float64)
		}
		paidFloat[e.PayerID][e.Currency] += float64(e.Amount)

		beneficiaries, _ := utils.JSONStringToSlice(e.BeneficiariesIds)
		totalWeight := 0.0
		for _, b := range beneficiaries {
			totalWeight += userWeights[b]
		}
		if totalWeight == 0 {
			continue
		}
		for _, b := range beneficiaries {
			s := float64(e.Amount) * userWeights[b] / totalWeight
			if shareFloat[b] == nil {
				shareFloat[b] = make(map[string]float64)
			}
			shareFloat[b][e.Currency] += s
		}
	}

	return roundGroupBalance(paidFloat), roundGroupBalance(shareFloat)
}

func roundGroupBalance(in map[string]map[string]float64) GroupBalance {
	out := make(GroupBalance, len(in))
	for userID, perCurr := range in {
		out[userID] = make(PerCurrencyBalance, len(perCurr))
		for c, v := range perCurr {
			out[userID][c] = int64(math.Round(v))
		}
	}
	return out
}

// BalanceSnapshot is the rounded per-currency, per-user balance as of Date
// (the end of an activity day).
type BalanceSnapshot struct {
	Date     time.Time
	Balances map[string]map[string]int64 // currency -> userID -> cents
}

// ComputeBalanceTimeline replays expenses, transfers and conversions in
// (date asc, created_at asc, id asc) order, accumulating in float cents, and
// emits one snapshot per distinct activity day (carry-forward between days). It
// reuses the same event-building/fold math as ComputeGroupBalance, so the final
// snapshot equals the current group balance.
func ComputeBalanceTimeline(
	members *[]database.GetGroupMembersRow,
	expenses *[]database.GetGroupExpensesRow,
	transfers *[]database.GetGroupTransfersForBalanceRow,
	conversions *[]database.GetGroupConversionsForBalanceRow,
	defaultCurrency string,
) []BalanceSnapshot {

	userWeights := make(map[string]float64, len(*members))
	for _, m := range *members {
		userWeights[m.UserID] = m.Weight
	}

	currencies := make(map[string]bool)
	currencies[defaultCurrency] = true
	for _, e := range *expenses {
		currencies[e.Currency] = true
	}
	for _, t := range *transfers {
		currencies[t.Currency] = true
	}
	for _, c := range *conversions {
		currencies[c.FromCurrency] = true
		currencies[c.ToCurrency] = true
	}

	floatBalances := make(map[string]map[string]float64, len(userWeights))
	for userID := range userWeights {
		floatBalances[userID] = make(map[string]float64, len(currencies))
		for c := range currencies {
			floatBalances[userID][c] = 0
		}
	}

	events := buildBalanceEvents(*expenses, *transfers, *conversions, userWeights, floatBalances)

	snapshot := func(day time.Time) BalanceSnapshot {
		balances := make(map[string]map[string]int64, len(currencies))
		for c := range currencies {
			balances[c] = make(map[string]int64, len(userWeights))
			for userID := range userWeights {
				balances[c][userID] = int64(math.Round(floatBalances[userID][c]))
			}
		}
		return BalanceSnapshot{Date: day, Balances: balances}
	}

	var snapshots []BalanceSnapshot
	i := 0
	for i < len(events) {
		day := dayKey(events[i].date)
		for i < len(events) && dayKey(events[i].date).Equal(day) {
			events[i].apply()
			i++
		}
		snapshots = append(snapshots, snapshot(day))
	}
	return snapshots
}

// SpendSnapshot is the cumulative (running) spend per currency as of Date.
type SpendSnapshot struct {
	Date  time.Time
	Total map[string]int64 // currency -> cumulative cents
}

// ComputeSpendingTimeline replays expenses in (date asc, created_at asc) order
// and emits one snapshot per distinct activity day with the running total spend
// per currency (carry-forward between days). Expenses are already in integer
// cents, so no rounding is needed. Transfers are excluded — they move money
// between members but don't add to group spend.
func ComputeSpendingTimeline(
	expenses *[]database.GetGroupExpensesRow,
	defaultCurrency string,
) []SpendSnapshot {

	currencies := map[string]bool{defaultCurrency: true}
	for _, e := range *expenses {
		currencies[e.Currency] = true
	}

	sorted := make([]database.GetGroupExpensesRow, len(*expenses))
	copy(sorted, *expenses)
	sort.SliceStable(sorted, func(i, j int) bool {
		if !sorted[i].Date.Time.Equal(sorted[j].Date.Time) {
			return sorted[i].Date.Time.Before(sorted[j].Date.Time)
		}
		return sorted[i].CreatedAt.Time.Before(sorted[j].CreatedAt.Time)
	})

	totals := make(map[string]int64, len(currencies))
	for c := range currencies {
		totals[c] = 0
	}

	var snapshots []SpendSnapshot
	i := 0
	for i < len(sorted) {
		day := dayKey(sorted[i].Date.Time)
		for i < len(sorted) && dayKey(sorted[i].Date.Time).Equal(day) {
			totals[sorted[i].Currency] += sorted[i].Amount
			i++
		}
		snap := SpendSnapshot{Date: day, Total: make(map[string]int64, len(totals))}
		maps.Copy(snap.Total, totals)
		snapshots = append(snapshots, snap)
	}
	return snapshots
}

func dayKey(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}
