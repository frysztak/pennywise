package calc

import (
	"pennywise/db/database"
	"pennywise/utils"
)

type PerCurrencyBalance map[string]float64
type GroupBalance map[string]PerCurrencyBalance

func ComputeGroupBalance(
	members *[]database.GetGroupMembersRow,
	expenses *[]database.GetGroupExpensesRow) GroupBalance {

	userWeights := make(map[string]float64)
	for _, value := range *members {
		userWeights[value.UserID] = value.Weight
	}
	balances := make(GroupBalance)

	for _, expense := range *expenses {
		beneficiaries, _ := utils.JSONStringToSlice(expense.BeneficiariesIds)

		// total weight for this expense
		totalWeight := 0.0
		for _, beneficiaryId := range beneficiaries {
			totalWeight += userWeights[beneficiaryId]
		}

		// owed shares
		for _, beneficiaryId := range beneficiaries {
			share := float64(*expense.Amount) * (userWeights[beneficiaryId] / totalWeight)

			if _, hasBeneficiary := balances[beneficiaryId]; !hasBeneficiary {
				balances[beneficiaryId] = make(PerCurrencyBalance)
			}
			if _, hasCurrency := balances[beneficiaryId][expense.Currency]; !hasCurrency {
				balances[beneficiaryId][expense.Currency] = 0
			}
			balances[beneficiaryId][expense.Currency] -= share
		}

		// payments
		balances[*expense.PayerID][expense.Currency] += float64(*expense.Amount)
	}

	// TODO: add transfers

	return balances
}
