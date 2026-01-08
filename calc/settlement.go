package calc

import (
	"sort"
)

// SettlementSuggestion represents a suggested transfer to settle debts.
type SettlementSuggestion struct {
	FromUserID string
	ToUserID   string
	Amount     int64  // cents, always positive
	Currency   string
}

type userBalance struct {
	userID string
	amount int64
}

// CalculateSettlements computes minimal transfers to settle all debts.
// Input: GroupBalance (map[userID]PerCurrencyBalance)
// Positive balance = user is owed money, negative = user owes money.
func CalculateSettlements(balances GroupBalance) []SettlementSuggestion {
	if len(balances) == 0 {
		return nil
	}

	// Collect all currencies
	currencies := make(map[string]bool)
	for _, currencyBalances := range balances {
		for currency := range currencyBalances {
			currencies[currency] = true
		}
	}

	// Sort currencies for deterministic output
	sortedCurrencies := make([]string, 0, len(currencies))
	for currency := range currencies {
		sortedCurrencies = append(sortedCurrencies, currency)
	}
	sort.Strings(sortedCurrencies)

	var results []SettlementSuggestion

	// Process each currency independently
	for _, currency := range sortedCurrencies {
		settlements := settleForCurrency(balances, currency)
		results = append(results, settlements...)
	}

	return results
}

// CalculateSettlementsInCurrency converts all debts to a single currency and settles.
// conversionRates maps source currency to a multiplier to get target currency amount.
// Example: if targetCurrency is USD and EUR→USD is 1.10, conversionRates["EUR"] = 1.10
func CalculateSettlementsInCurrency(
	balances GroupBalance,
	targetCurrency string,
	conversionRates map[string]float64,
) []SettlementSuggestion {
	if len(balances) == 0 {
		return nil
	}

	// Convert all balances to target currency
	convertedBalances := make(PerCurrencyBalance)

	for userID, currencyBalances := range balances {
		var totalInTarget int64
		for currency, amount := range currencyBalances {
			if currency == targetCurrency {
				totalInTarget += amount
			} else if rate, ok := conversionRates[currency]; ok {
				// Convert: amount * rate = amount in target currency
				converted := int64(float64(amount) * rate)
				totalInTarget += converted
			}
			// Skip currencies without conversion rate (shouldn't happen with proper UI)
		}
		if totalInTarget != 0 {
			convertedBalances[userID] = totalInTarget
		}
	}

	return settleForSingleCurrency(convertedBalances, targetCurrency)
}

func settleForCurrency(balances GroupBalance, currency string) []SettlementSuggestion {
	// Extract single-currency balances
	singleCurrencyBalances := make(PerCurrencyBalance)
	for userID, currencyBalances := range balances {
		if amount, exists := currencyBalances[currency]; exists && amount != 0 {
			singleCurrencyBalances[userID] = amount
		}
	}
	return settleForSingleCurrency(singleCurrencyBalances, currency)
}

func settleForSingleCurrency(balances PerCurrencyBalance, currency string) []SettlementSuggestion {
	var creditors, debtors []userBalance

	// Separate into creditors and debtors
	for userID, amount := range balances {
		if amount > 0 {
			creditors = append(creditors, userBalance{userID, amount})
		} else if amount < 0 {
			debtors = append(debtors, userBalance{userID, -amount}) // Store as positive
		}
	}

	// Sort for deterministic output (amount desc, then userID asc)
	sortByAmountDesc := func(list []userBalance) {
		sort.Slice(list, func(i, j int) bool {
			if list[i].amount != list[j].amount {
				return list[i].amount > list[j].amount
			}
			return list[i].userID < list[j].userID
		})
	}
	sortByAmountDesc(creditors)
	sortByAmountDesc(debtors)

	var results []SettlementSuggestion

	// Greedy matching
	ci, di := 0, 0
	for ci < len(creditors) && di < len(debtors) {
		creditor := &creditors[ci]
		debtor := &debtors[di]

		// Transfer the minimum of the two amounts
		transferAmount := min(creditor.amount, debtor.amount)

		results = append(results, SettlementSuggestion{
			FromUserID: debtor.userID,
			ToUserID:   creditor.userID,
			Amount:     transferAmount,
			Currency:   currency,
		})

		// Update remaining amounts
		creditor.amount -= transferAmount
		debtor.amount -= transferAmount

		// Move past fully settled parties
		if creditor.amount == 0 {
			ci++
		}
		if debtor.amount == 0 {
			di++
		}
	}

	return results
}
