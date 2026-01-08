# Single Currency Settlement Mode

## Overview

Add single currency mode to settlement suggestions, allowing users to consolidate multi-currency debts into a single target currency by providing exchange rates.

## Current State

The API already supports single currency mode:
- `GetSettlementSuggestionsRequest` has optional `target_currency` and `conversion_rates` fields
- `GetSettlementSuggestionsResponse` returns `currencies_in_group` for UI to show conversion inputs
- Backend calculates consolidated settlements when target currency is provided

## Implementation Plan

### 1. Update SettlementSuggestions Component

**File:** `web/src/components/group/settlement-suggestions.tsx`

Changes:
- Move the "Settle up" heading into the component (currently in parent `$groupId.tsx`)
- Add dropdown menu next to heading with "Single currency mode" option
- Manage local state for single currency mode (`targetCurrency`, `conversionRates`)
- Pass these to the API query when in single currency mode
- Show indicator when single currency mode is active with option to clear

```tsx
// New props needed
interface SettlementSuggestionsProps {
  groupId: string;
  currentUserId: string;
  onSettle: (templateDefaults: TransferTemplateDefaults) => void;
}

// New local state
const [singleCurrencyMode, setSingleCurrencyMode] = useState<{
  targetCurrency: string;
  conversionRates: Record<string, number>;
} | null>(null);

// Modal state for exchange rate entry
const [exchangeRateModalOpen, setExchangeRateModalOpen] = useState(false);
```

### 2. Create Exchange Rate Modal Component

**File:** `web/src/components/group/single-currency-modal.tsx`

A dialog that:
- Shows target currency selector (from `currencies_in_group`)
- For each other currency, shows an input for the exchange rate
- Exchange rate = "1 [source] = X [target]" format
- Pre-fills with rate of 1.0 as starting point
- Validates all rates are positive numbers
- On submit, closes modal and updates parent state

```tsx
interface SingleCurrencyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currencies: string[];  // currencies_in_group from API
  defaultCurrency: string;  // group's default currency as initial target
  onConfirm: (targetCurrency: string, rates: Record<string, number>) => void;
}
```

### 3. Update Parent Page

**File:** `web/src/routes/_pathlessLayout/group/$groupId.tsx`

Changes:
- Remove "Settle up" h2 heading (move into SettlementSuggestions)
- Pass `defaultCurrency` to SettlementSuggestions for modal default

### 4. Handle Settlement in Single Currency Mode

When user clicks "Settle" on a single-currency-mode suggestion:
- The suggestion will have the target currency
- For proper accounting, we need to record actual transfers
- **Decision:** Create a single transfer in the target currency
  - The backend already calculated the converted amount
  - Recording one transfer in target currency is simpler and accurate
  - Alternative (create transfer per original currency) would require tracking original amounts which we don't have

### 5. Query Refetch Strategy

Use TanStack Query's `queryKey` to handle different modes:
```tsx
const { data } = useSuspenseQuery(getSettlementSuggestions, {
  groupId,
  targetCurrency: singleCurrencyMode?.targetCurrency,
  conversionRates: singleCurrencyMode?.conversionRates ?? {},
});
```

When `singleCurrencyMode` changes, the query automatically refetches with new parameters.

## UI Flow

1. User sees "Settle up" section with dropdown menu (three dots or "Options" button)
2. User clicks dropdown → selects "Single currency mode"
3. Modal opens showing:
   - Target currency dropdown (default: group's default currency)
   - For each other currency: "1 USD = ___ EUR" style inputs
4. User fills rates and clicks "Apply"
5. Modal closes, settlements recalculate in single currency
6. Header shows "Settle up (Single currency: EUR)" with "Clear" button
7. User can settle normally, transfers recorded in target currency

## File Changes Summary

| File | Change |
|------|--------|
| `settlement-suggestions.tsx` | Add dropdown, modal trigger, single currency state |
| `single-currency-modal.tsx` | New file - exchange rate entry modal |
| `$groupId.tsx` | Remove h2, pass defaultCurrency prop |

## Edge Cases

- Only one currency in group → hide single currency option (no conversion needed)
- User enters 0 or negative rate → validation error
- User cancels modal → no change to current mode
- API error with invalid rates → show error toast, keep previous state

## Future Enhancements

- Fetch live exchange rates from an API
- Remember last used rates per group
- Show converted amounts preview in modal before applying
