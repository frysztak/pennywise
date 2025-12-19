package calc

import (
	"pennywise/db/database"
	"pennywise/utils"
)

type PerCurrencyBalance map[string]int64
type GroupBalance map[string]PerCurrencyBalance

func ComputeGroupBalance(
	members *[]database.GetGroupMembersRow,
	expenses *[]database.GetGroupExpensesRow,
	transfers *[]database.GetGroupTransfersForBalanceRow,
	defaultCurrency string) GroupBalance {

	userWeights := make(map[string]float64)
	for _, value := range *members {
		userWeights[value.UserID] = value.Weight
	}
	balances := make(GroupBalance)

	// Collect all currencies used in expenses and transfers, starting with default currency
	currencies := make(map[string]bool)
	currencies[defaultCurrency] = true
	for _, expense := range *expenses {
		currencies[expense.Currency] = true
	}
	for _, transfer := range *transfers {
		currencies[transfer.Currency] = true
	}

	// Initialize all members with zero balances for all currencies
	for userID := range userWeights {
		balances[userID] = make(PerCurrencyBalance)
		for currency := range currencies {
			balances[userID][currency] = 0
		}
	}

	for _, expense := range *expenses {
		beneficiaries, _ := utils.JSONStringToSlice(expense.BeneficiariesIds)

		// total weight for this expense
		totalWeight := 0.0
		for _, beneficiaryId := range beneficiaries {
			totalWeight += userWeights[beneficiaryId]
		}

		// owed shares
		for _, beneficiaryId := range beneficiaries {
			share := int64(float64(expense.Amount) * (userWeights[beneficiaryId] / totalWeight))
			balances[beneficiaryId][expense.Currency] -= share
		}

		// payments
		balances[expense.PayerID][expense.Currency] += expense.Amount
	}

	// Process transfers: sender gave money, receiver got money
	for _, transfer := range *transfers {
		balances[transfer.SenderID][transfer.Currency] += transfer.Amount
		balances[transfer.ReceiverID][transfer.Currency] -= transfer.Amount
	}

	return balances
}
