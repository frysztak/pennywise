package calc

import (
	"math"
	"pennywise/db/database"
	"pennywise/utils"
)

type PerCurrencyBalance map[string]int64
type GroupBalance map[string]PerCurrencyBalance

// ComputeGroupBalance accumulates every per-beneficiary share as a float64
// in sub-cent precision and rounds only once per user/currency at the end.
// This mirrors ihatemoney's settlement math: no per-expense truncation, no
// systematic bias toward whoever happens to appear first in beneficiaries.
// The displayed sum across users may differ from zero by ±1¢ per currency
// when shares don't divide cleanly — same property as ihatemoney's UI.
func ComputeGroupBalance(
	members *[]database.GetGroupMembersRow,
	expenses *[]database.GetGroupExpensesRow,
	transfers *[]database.GetGroupTransfersForBalanceRow,
	defaultCurrency string) GroupBalance {

	userWeights := make(map[string]float64)
	for _, value := range *members {
		userWeights[value.UserID] = value.Weight
	}

	// Collect all currencies used in expenses and transfers, starting with default currency
	currencies := make(map[string]bool)
	currencies[defaultCurrency] = true
	for _, expense := range *expenses {
		currencies[expense.Currency] = true
	}
	for _, transfer := range *transfers {
		currencies[transfer.Currency] = true
	}

	// Internal accumulator in float cents.
	floatBalances := make(map[string]map[string]float64, len(userWeights))
	for userID := range userWeights {
		floatBalances[userID] = make(map[string]float64, len(currencies))
		for c := range currencies {
			floatBalances[userID][c] = 0
		}
	}

	for _, expense := range *expenses {
		beneficiaries, _ := utils.JSONStringToSlice(expense.BeneficiariesIds)

		totalWeight := 0.0
		for _, beneficiaryId := range beneficiaries {
			totalWeight += userWeights[beneficiaryId]
		}
		if totalWeight == 0 {
			continue
		}

		for _, beneficiaryId := range beneficiaries {
			share := float64(expense.Amount) * userWeights[beneficiaryId] / totalWeight
			floatBalances[beneficiaryId][expense.Currency] -= share
		}
		floatBalances[expense.PayerID][expense.Currency] += float64(expense.Amount)
	}

	// Transfers are already in integer cents — no rounding needed.
	for _, transfer := range *transfers {
		floatBalances[transfer.SenderID][transfer.Currency] += float64(transfer.Amount)
		floatBalances[transfer.ReceiverID][transfer.Currency] -= float64(transfer.Amount)
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
