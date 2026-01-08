# Balance Settlement Implementation Plan

## Overview

Implement a balance settlement feature that suggests optimal payment paths to minimize transactions when settling group debts. Settlements use the existing transfer system - they're essentially "smart" transfer suggestions.

## Requirements Summary

- **Settlement Type**: Use existing transfers (settlements are suggested transfers)
- **Optimization**: Calculate minimum transactions needed (debt simplification)
- **Scope**: Per group
- **Partial Settlement**: Allowed (users can pay any amount up to what's owed)
- **Single Currency Mode**: Option to settle all debts in one currency with manual conversion rates

## Settlement Algorithm: Deep Dive

### Problem Statement

Given a set of user balances per currency, find the minimum number of transfers needed to bring all balances to zero.

**Input**: Map of userID → currency → balance (cents)
- Positive balance = user is owed money (creditor)
- Negative balance = user owes money (debtor)

**Output**: List of transfers (from, to, amount, currency) that settles all debts

**Constraint**: Balances always sum to zero (money in = money out in a closed system)

### Algorithm: Greedy Matching

We use a greedy approach that matches the largest debtor with the largest creditor. This is proven optimal for minimizing transaction count when debts can be combined.

#### Why Greedy Works

In a debt simplification problem:
- The theoretical minimum transactions = max(num_creditors, num_debtors) - 1 in simple cases
- Greedy matching achieves this minimum by always fully settling at least one party per transaction

#### Step-by-Step Algorithm

```
function CalculateSettlements(balances: map[userID]map[currency]int64) -> []Settlement:
    results = []

    // Process each currency independently
    for each currency in all_currencies(balances):
        // Step 1: Extract balances for this currency
        currency_balances = {}
        for userID, currencies in balances:
            if currency in currencies and currencies[currency] != 0:
                currency_balances[userID] = currencies[currency]

        // Step 2: Separate into creditors and debtors
        creditors = []  // (userID, amount) where amount > 0
        debtors = []    // (userID, amount) where amount < 0 (stored as positive for easier math)

        for userID, amount in currency_balances:
            if amount > 0:
                creditors.append((userID, amount))
            else if amount < 0:
                debtors.append((userID, -amount))  // Store positive

        // Step 3: Sort for deterministic output
        sort creditors by amount descending, then by userID
        sort debtors by amount descending, then by userID

        // Step 4: Greedy matching
        while creditors not empty and debtors not empty:
            creditor = creditors[0]
            debtor = debtors[0]

            // Transfer amount is the minimum of what's owed and what's due
            transfer_amount = min(creditor.amount, debtor.amount)

            results.append(Settlement{
                FromUserID: debtor.userID,
                ToUserID: creditor.userID,
                Amount: transfer_amount,
                Currency: currency,
            })

            // Update balances
            creditor.amount -= transfer_amount
            debtor.amount -= transfer_amount

            // Remove fully settled parties
            if creditor.amount == 0:
                creditors.remove(0)
            if debtor.amount == 0:
                debtors.remove(0)

    return results
```

### Single Currency Settlement Mode

When the user enables "Settle in one currency", all debts across currencies are converted to a target currency using user-provided conversion rates.

#### Algorithm Modification

```
function CalculateSettlementsInSingleCurrency(
    balances: map[userID]map[currency]int64,
    targetCurrency: string,
    conversionRates: map[currency]float64  // rate to multiply to get target currency
) -> []Settlement:

    // Step 1: Convert all balances to target currency
    convertedBalances = map[userID]int64{}

    for userID, currencyBalances in balances:
        totalInTarget = 0
        for currency, amount in currencyBalances:
            if currency == targetCurrency:
                totalInTarget += amount
            else:
                rate = conversionRates[currency]
                // Convert: amount in source * rate = amount in target
                convertedAmount = int64(float64(amount) * rate)
                totalInTarget += convertedAmount

        if totalInTarget != 0:
            convertedBalances[userID] = totalInTarget

    // Step 2: Run standard settlement algorithm on converted balances
    // (same greedy matching, but single currency)

    return settleForSingleCurrency(convertedBalances, targetCurrency)
```

#### Example: Single Currency Settlement

**Original Balances**:
- Alice: USD +$50, EUR +€30
- Bob: USD -$50
- Carol: EUR -€30

**User selects**: Settle in USD, EUR→USD rate = 1.10

**Conversion**:
- Alice: $50 + (€30 × 1.10) = $50 + $33 = +$83 USD
- Bob: -$50 USD
- Carol: -(€30 × 1.10) = -$33 USD

**Result**: 2 transfers in USD
```
Bob → Alice: $50.00 USD
Carol → Alice: $33.00 USD
```

**Without single currency mode**: Would be 2 transfers in 2 currencies
```
Bob → Alice: $50.00 USD
Carol → Alice: €30.00 EUR
```

### Worked Examples

#### Example 1: Simple Two-Person Debt

**Balances (USD)**:
- Alice: +$50 (is owed $50)
- Bob: -$50 (owes $50)

**Algorithm execution**:
1. Creditors: [(Alice, 5000)]
2. Debtors: [(Bob, 5000)]
3. Match: Bob pays Alice $50
4. Both fully settled, done

**Result**: 1 transfer
```
Bob → Alice: $50.00 USD
```

#### Example 2: Multiple Users, Single Currency

**Balances (USD)**:
- Alice: +$30 (is owed $30)
- Bob: -$20 (owes $20)
- Carol: -$10 (owes $10)

**Algorithm execution**:
1. Creditors: [(Alice, 3000)]
2. Debtors: [(Bob, 2000), (Carol, 1000)]
3. Round 1: Bob pays Alice min(2000, 3000) = $20
   - Alice now: +$10, Bob now: $0 (removed)
4. Round 2: Carol pays Alice min(1000, 1000) = $10
   - Both settled, done

**Result**: 2 transfers
```
Bob → Alice: $20.00 USD
Carol → Alice: $10.00 USD
```

#### Example 3: Debt Simplification (The Key Optimization)

**Naive approach would create 3+ transfers**:
- Alice paid for Bob's lunch ($20)
- Bob paid for Carol's coffee ($10)
- Carol paid for Alice's taxi ($15)

**Balances (USD)**:
- Alice: +$5 (paid $20, received $15, net owed $5)
- Bob: -$10 (received $20, paid $10, owes $10)
- Carol: +$5 (paid $15, received $10, owed $5)

Wait, let me recalculate:
- Alice: paid $20, received $15 → is owed $5
- Bob: received $20 (from Alice), paid $10 → owes $10
- Carol: received $10 (from Bob), paid $15 → is owed $5

Verification: +5 - 10 + 5 = 0 ✓

**Algorithm execution**:
1. Creditors: [(Alice, 500), (Carol, 500)] - sorted by amount desc, then ID
2. Debtors: [(Bob, 1000)]
3. Round 1: Bob pays Alice min(1000, 500) = $5
   - Alice settled, Bob now owes $5
4. Round 2: Bob pays Carol min(500, 500) = $5
   - Both settled, done

**Result**: 2 transfers (not 3!)
```
Bob → Alice: $5.00 USD
Bob → Carol: $5.00 USD
```

#### Example 4: Multiple Currencies (Default Mode)

**Balances**:
- Alice: USD +$30, EUR +€20
- Bob: USD -$30
- Carol: EUR -€20

**Algorithm execution**:
- Process USD: Bob pays Alice $30
- Process EUR: Carol pays Alice €20

**Result**: 2 transfers (one per currency)
```
Bob → Alice: $30.00 USD
Carol → Alice: €20.00 EUR
```

#### Example 5: Complex Multi-Party

**Balances (USD)**:
- Alice: +$100
- Bob: -$60
- Carol: +$20
- Dave: -$40
- Eve: -$20

Verification: +100 - 60 + 20 - 40 - 20 = 0 ✓

**Algorithm execution**:
1. Creditors: [(Alice, 10000), (Carol, 2000)]
2. Debtors: [(Bob, 6000), (Dave, 4000), (Eve, 2000)]

3. Round 1: Bob pays Alice min(6000, 10000) = $60
   - Alice: $40, Bob: settled
4. Round 2: Dave pays Alice min(4000, 4000) = $40
   - Alice: settled, Dave: settled
5. Round 3: Eve pays Carol min(2000, 2000) = $20
   - Both settled

**Result**: 3 transfers
```
Bob → Alice: $60.00 USD
Dave → Alice: $40.00 USD
Eve → Carol: $20.00 USD
```

**Naive approach** (direct pairs) might have needed 4+ transfers.

### Algorithm Complexity

- **Time**: O(n log n) for sorting + O(n) for matching = O(n log n) per currency
- **Space**: O(n) for the creditor/debtor lists
- Where n = number of users with non-zero balance in that currency

### Implementation Notes

#### Handling Cents

All calculations use cents (int64) to avoid floating-point precision issues:

```go
// Input from calc.CalculateBalance() is already in cents
// Output settlements are in cents
// Convert to dollars only at API boundary for response
```

#### Deterministic Output

To ensure consistent results across calls:
1. Sort creditors by amount DESC, then userID ASC
2. Sort debtors by amount DESC, then userID ASC

This ensures the same balances always produce the same settlement suggestions.

#### Edge Cases

1. **Empty balances**: Return empty list
2. **All zeros**: Return empty list
3. **Single user with non-zero**: Should never happen (closed system), but handle gracefully
4. **Floating point from API**: Round to nearest cent on input
5. **Conversion rate rounding**: Round converted amounts to nearest cent

### Go Implementation

```go
// calc/settlement.go
package calc

import (
    "sort"
)

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
// Input: balances map[userID]map[currency]balanceInCents
// Positive balance = user is owed money, negative = user owes money.
func CalculateSettlements(balances map[string]map[string]int64) []SettlementSuggestion {
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

    var results []SettlementSuggestion

    // Process each currency independently
    for currency := range currencies {
        settlements := settleForCurrency(balances, currency)
        results = append(results, settlements...)
    }

    return results
}

// CalculateSettlementsInCurrency converts all debts to a single currency and settles.
// conversionRates maps source currency to a multiplier to get target currency amount.
// Example: if targetCurrency is USD and EUR→USD is 1.10, conversionRates["EUR"] = 1.10
func CalculateSettlementsInCurrency(
    balances map[string]map[string]int64,
    targetCurrency string,
    conversionRates map[string]float64,
) []SettlementSuggestion {
    if len(balances) == 0 {
        return nil
    }

    // Convert all balances to target currency
    convertedBalances := make(map[string]int64)

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

func settleForCurrency(balances map[string]map[string]int64, currency string) []SettlementSuggestion {
    // Extract single-currency balances
    singleCurrencyBalances := make(map[string]int64)
    for userID, currencyBalances := range balances {
        if amount, exists := currencyBalances[currency]; exists && amount != 0 {
            singleCurrencyBalances[userID] = amount
        }
    }
    return settleForSingleCurrency(singleCurrencyBalances, currency)
}

func settleForSingleCurrency(balances map[string]int64, currency string) []SettlementSuggestion {
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
        transferAmount := creditor.amount
        if debtor.amount < transferAmount {
            transferAmount = debtor.amount
        }

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
```

## Architecture

### Integration with Existing Balance Calculation

The existing `calc.CalculateBalance()` returns balances per user per currency. We feed this directly into `CalculateSettlements()`:

```go
// In handler
balances := calc.CalculateBalance(expenses, transfers, members)
// balances is map[userID]map[currency]int64

// Default mode: settle per currency
settlements := calc.CalculateSettlements(balances)

// OR single currency mode: settle all in one currency
settlements := calc.CalculateSettlementsInCurrency(balances, "USD", map[string]float64{
    "EUR": 1.10,
    "GBP": 1.25,
})
```

## Implementation Steps

### Phase 1: Backend - Settlement Calculation

#### 1.1 Create Settlement Calculation Logic

Create `calc/settlement.go` with:
- `CalculateSettlements()` - default multi-currency mode
- `CalculateSettlementsInCurrency()` - single currency mode with conversion

#### 1.2 Create Comprehensive Tests

Create `calc/settlement_test.go`:

```go
func TestCalculateSettlements_Empty(t *testing.T)
func TestCalculateSettlements_TwoUsers(t *testing.T)
func TestCalculateSettlements_MultipleDebtors(t *testing.T)
func TestCalculateSettlements_MultipleCreditors(t *testing.T)
func TestCalculateSettlements_ComplexMultiParty(t *testing.T)
func TestCalculateSettlements_MultipleCurrencies(t *testing.T)
func TestCalculateSettlements_Deterministic(t *testing.T)
func TestCalculateSettlements_MinimalTransactions(t *testing.T)

// Single currency mode tests
func TestCalculateSettlementsInCurrency_Basic(t *testing.T)
func TestCalculateSettlementsInCurrency_MultipleSourceCurrencies(t *testing.T)
func TestCalculateSettlementsInCurrency_RoundingEdgeCases(t *testing.T)
```

#### 1.3 Add Settlement API Endpoint

Add to `proto/api/v1/group.proto`:

```protobuf
message GetSettlementSuggestionsRequest {
  string group_id = 1 [(buf.validate.field).string.uuid = true];

  // Optional: settle all debts in a single currency
  optional string target_currency = 2;

  // Required if target_currency is set: conversion rates from other currencies
  // Key: source currency code, Value: multiplier to get target currency
  map<string, double> conversion_rates = 3;
}

message SettlementSuggestion {
  string from_user_id = 1;
  string from_user_name = 2;
  string to_user_id = 3;
  string to_user_name = 4;
  double amount = 5;  // Dollars, converted from cents
  string currency = 6;
}

message GetSettlementSuggestionsResponse {
  repeated SettlementSuggestion suggestions = 1;

  // List of currencies in the group (for UI to show conversion rate inputs)
  repeated string currencies_in_group = 2;
}
```

#### 1.4 Implement Handler

In `http/routes/group/group.go`:

```go
func (s *Service) GetSettlementSuggestions(ctx context.Context, req *connect.Request[v1.GetSettlementSuggestionsRequest]) (*connect.Response[v1.GetSettlementSuggestionsResponse], error) {
    logger := log.FromContext(ctx)
    userID, err := helpers.GetSessionInfo(ctx)
    if err != nil {
        return nil, connect.NewError(connect.CodeUnauthenticated, err)
    }

    // Verify user is group member
    _, err = db.ReadQueries.GetGroupMember(ctx, database.GetGroupMemberParams{
        GroupID: req.Msg.GroupId,
        UserID:  userID,
    })
    if err != nil {
        return nil, connect.NewError(connect.CodePermissionDenied, fmt.Errorf("not a group member"))
    }

    // Get all data needed for balance calculation
    expenses, _ := db.ReadQueries.GetGroupExpenses(ctx, req.Msg.GroupId)
    transfers, _ := db.ReadQueries.GetGroupTransfers(ctx, req.Msg.GroupId)
    members, _ := db.ReadQueries.GetGroupMembers(ctx, req.Msg.GroupId)

    // Calculate current balances
    balances := calc.CalculateBalance(expenses, transfers, members)

    // Collect currencies in group
    currenciesMap := make(map[string]bool)
    for _, currencyBalances := range balances {
        for currency := range currencyBalances {
            currenciesMap[currency] = true
        }
    }
    var currencies []string
    for c := range currenciesMap {
        currencies = append(currencies, c)
    }
    sort.Strings(currencies)

    // Calculate settlements (single currency mode or default)
    var settlements []calc.SettlementSuggestion
    if req.Msg.TargetCurrency != nil && *req.Msg.TargetCurrency != "" {
        settlements = calc.CalculateSettlementsInCurrency(
            balances,
            *req.Msg.TargetCurrency,
            req.Msg.ConversionRates,
        )
    } else {
        settlements = calc.CalculateSettlements(balances)
    }

    // Build response with user names
    resp := &v1.GetSettlementSuggestionsResponse{
        CurrenciesInGroup: currencies,
    }
    userNames := buildUserNameMap(members)

    for _, s := range settlements {
        resp.Suggestions = append(resp.Suggestions, &v1.SettlementSuggestion{
            FromUserId:   s.FromUserID,
            FromUserName: userNames[s.FromUserID],
            ToUserId:     s.ToUserID,
            ToUserName:   userNames[s.ToUserID],
            Amount:       float64(s.Amount) / 100, // Convert cents to dollars
            Currency:     s.Currency,
        })
    }

    return connect.NewResponse(resp), nil
}
```

### Phase 2: Frontend - Settlement UI

#### 2.1 Settlement Suggestions Component

Create `web/src/components/group/settlement-suggestions.tsx`:

- Display list of suggested settlements
- Each suggestion shows: "{From} pays {To} {Amount} {Currency}"
- "Settle" button on each suggestion opens transfer modal pre-filled
- Filter to show only settlements involving current user

#### 2.2 Single Currency Mode UI

Add to settlement suggestions component:

- Checkbox: "Settle all in one currency"
- When checked:
  - Currency selector dropdown (target currency)
  - For each other currency in group, show input field:
    - "1 EUR = ___ USD" (rate input)
  - "Calculate" button to fetch new suggestions with rates
- Suggestions update to show all amounts in target currency

**UI Flow**:
```
[ ] Settle all in one currency

When checked:
┌─────────────────────────────────────┐
│ Settlement Currency: [USD ▼]        │
│                                     │
│ Conversion Rates:                   │
│ 1 EUR = [1.10] USD                  │
│ 1 GBP = [1.25] USD                  │
│                                     │
│ [Calculate Settlements]             │
└─────────────────────────────────────┘
```

#### 2.3 Settle Modal Integration

Modify transfer modal (`web/src/components/transfer/transfer-modal.tsx`):

- Accept optional pre-filled values (sender, receiver, amount, currency)
- Allow editing amount for partial settlement
- After successful settlement, invalidate settlement suggestions query

#### 2.4 Settlement Section in Group Page

Add to `web/src/routes/_pathlessLayout/group/$groupId.tsx`:

- New "Settle Up" section or tab
- Shows settlement suggestions
- Primary display: suggestions involving current user
- Secondary: all group settlements
- Empty state: "You're all settled up!"

#### 2.5 Quick Settle Action

Add to balance cards or member balances table:
- "Settle" button next to users you owe money to
- Opens transfer modal pre-filled with the optimal amount

### Phase 3: Polish & Edge Cases

#### 3.1 Handle Edge Cases

- **Zero balances**: Show "all settled" state
- **Same user**: Algorithm naturally avoids (can't owe yourself)
- **Concurrent modifications**: Invalidate queries after any expense/transfer mutation
- **Missing conversion rate**: Disable calculate button until all rates filled
- **Invalid conversion rate**: Validate rates > 0

#### 3.2 Testing

Backend:
- Unit tests for `calc/settlement.go` (both modes)
- Integration test for the API endpoint

Frontend:
- Component tests for settlement suggestions display
- Tests for single currency mode UI
- E2E test for full settlement flow

## File Changes Summary

### New Files
- `calc/settlement.go` - Settlement calculation algorithm
- `calc/settlement_test.go` - Algorithm tests
- `web/src/components/group/settlement-suggestions.tsx` - Suggestions UI

### Modified Files
- `proto/api/v1/group.proto` - Add GetSettlementSuggestions RPC
- `http/routes/group/group.go` - Implement handler
- `web/src/components/transfer/transfer-modal.tsx` - Accept pre-filled values
- `web/src/routes/_pathlessLayout/group/$groupId.tsx` - Add settlement section

## API Contract

### Request (Default Mode)
```
POST /pennywise.api.v1.GroupService/GetSettlementSuggestions
{
  "groupId": "uuid"
}
```

### Request (Single Currency Mode)
```
POST /pennywise.api.v1.GroupService/GetSettlementSuggestions
{
  "groupId": "uuid",
  "targetCurrency": "USD",
  "conversionRates": {
    "EUR": 1.10,
    "GBP": 1.25
  }
}
```

### Response
```json
{
  "suggestions": [
    {
      "fromUserId": "uuid",
      "fromUserName": "Bob",
      "toUserId": "uuid",
      "toUserName": "Alice",
      "amount": 25.50,
      "currency": "USD"
    }
  ],
  "currenciesInGroup": ["USD", "EUR", "GBP"]
}
```

## Success Criteria

- [ ] Settlement algorithm produces minimal transaction count
- [ ] Algorithm handles multi-currency groups correctly
- [ ] Single currency mode converts all debts correctly
- [ ] API returns correct suggestions based on current balances
- [ ] Users can create settlements with one click
- [ ] Partial settlements work correctly
- [ ] UI clearly shows what the user owes/is owed
- [ ] Single currency UI allows entering conversion rates
- [ ] Empty state shown when all settled
