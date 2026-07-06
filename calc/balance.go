package calc

import (
	"math"
	"pennywise/db/database"
	"pennywise/utils"
	"sort"
	"time"
)

type PerCurrencyBalance map[string]int64
type GroupBalance map[string]PerCurrencyBalance

// ComputeGroupBalance replays every action (expense, transfer, conversion) in
// chronological (date, created_at, id) order, accumulating per-(user, currency)
// shares as float64 sub-cents and rounding only once per user/currency at the
// end. This mirrors ihatemoney's settlement math: no per-expense truncation, no
// systematic bias toward whoever happens to appear first in beneficiaries. The
// displayed sum across users may differ from zero by ±1¢ per currency when
// shares don't divide cleanly — same property as ihatemoney's UI.
//
// Ordering matters because a currency conversion folds the whole group's
// outstanding position in one currency into another *as of its date*: it only
// has meaning relative to the running balance at that moment. Expenses and
// transfers are order-independent on their own, but conversions are not, so the
// whole computation is a temporal replay rather than a single bucketed sum.
func ComputeGroupBalance(
	members *[]database.GetGroupMembersRow,
	expenses *[]database.GetGroupExpensesRow,
	transfers *[]database.GetGroupTransfersForBalanceRow,
	conversions *[]database.GetGroupConversionsForBalanceRow,
	defaultCurrency string) GroupBalance {

	userWeights := make(map[string]float64)
	for _, value := range *members {
		userWeights[value.UserID] = value.Weight
	}

	// Collect all currencies seen across actions, starting with default currency.
	currencies := make(map[string]bool)
	currencies[defaultCurrency] = true
	for _, expense := range *expenses {
		currencies[expense.Currency] = true
	}
	for _, transfer := range *transfers {
		currencies[transfer.Currency] = true
	}
	for _, conv := range *conversions {
		currencies[conv.FromCurrency] = true
		currencies[conv.ToCurrency] = true
	}

	// Internal accumulator in float cents.
	floatBalances := make(map[string]map[string]float64, len(userWeights))
	for userID := range userWeights {
		floatBalances[userID] = make(map[string]float64, len(currencies))
		for c := range currencies {
			floatBalances[userID][c] = 0
		}
	}

	for _, event := range buildBalanceEvents(*expenses, *transfers, *conversions, userWeights, floatBalances) {
		event.apply()
	}

	balances := make(GroupBalance, len(floatBalances))
	for userID, perCurr := range floatBalances {
		balances[userID] = make(PerCurrencyBalance, len(perCurr))
		for c, v := range perCurr {
			balances[userID][c] = int64(math.Round(v))
		}
	}
	return balances
}

// balanceEvent is a single action applied to the running float balances during
// a temporal replay. apply mutates the shared floatBalances map.
type balanceEvent struct {
	date      time.Time
	createdAt time.Time
	id        string
	apply     func()
}

// buildBalanceEvents turns the three action lists into a single chronologically
// sorted slice of mutations over floatBalances. It is shared by ComputeGroupBalance
// and ComputeBalanceTimeline so the two always agree.
func buildBalanceEvents(
	expenses []database.GetGroupExpensesRow,
	transfers []database.GetGroupTransfersForBalanceRow,
	conversions []database.GetGroupConversionsForBalanceRow,
	userWeights map[string]float64,
	floatBalances map[string]map[string]float64,
) []balanceEvent {

	events := make([]balanceEvent, 0, len(expenses)+len(transfers)+len(conversions))

	for _, expense := range expenses {
		events = append(events, balanceEvent{
			date:      expense.Date.Time,
			createdAt: expense.CreatedAt.Time,
			id:        expense.ID,
			apply: func() {
				beneficiaries, _ := utils.JSONStringToSlice(expense.BeneficiariesIds)
				totalWeight := 0.0
				for _, beneficiaryId := range beneficiaries {
					totalWeight += userWeights[beneficiaryId]
				}
				if totalWeight == 0 {
					return
				}
				for _, beneficiaryId := range beneficiaries {
					share := float64(expense.Amount) * userWeights[beneficiaryId] / totalWeight
					floatBalances[beneficiaryId][expense.Currency] -= share
				}
				floatBalances[expense.PayerID][expense.Currency] += float64(expense.Amount)
			},
		})
	}

	for _, transfer := range transfers {
		events = append(events, balanceEvent{
			date:      transfer.Date.Time,
			createdAt: transfer.CreatedAt.Time,
			id:        transfer.ID,
			apply: func() {
				floatBalances[transfer.SenderID][transfer.Currency] += float64(transfer.Amount)
				floatBalances[transfer.ReceiverID][transfer.Currency] -= float64(transfer.Amount)
			},
		})
	}

	// A conversion folds the whole group's position in from_currency into
	// to_currency at the given rate. Folding every user by the same rate keeps
	// the per-currency balance zero-sum (if Σ from == 0 then Σ from*rate == 0).
	// We round each user's contribution at the fold, mirroring the "round once"
	// philosophy; across the group the rounded contributions still sum to ~0
	// (±1¢ per currency).
	for _, conv := range conversions {
		events = append(events, balanceEvent{
			date:      conv.Date.Time,
			createdAt: conv.CreatedAt.Time,
			id:        conv.ID,
			apply: func() {
				for userID := range floatBalances {
					from := floatBalances[userID][conv.FromCurrency]
					if from == 0 {
						continue
					}
					floatBalances[userID][conv.ToCurrency] += math.Round(from * conv.Rate)
					floatBalances[userID][conv.FromCurrency] = 0
				}
			},
		})
	}

	sort.SliceStable(events, func(i, j int) bool {
		if !events[i].date.Equal(events[j].date) {
			return events[i].date.Before(events[j].date)
		}
		if !events[i].createdAt.Equal(events[j].createdAt) {
			return events[i].createdAt.Before(events[j].createdAt)
		}
		return events[i].id < events[j].id
	})

	return events
}
