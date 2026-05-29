# Amount Field Calculator — Implementation Plan

## Overview

Let users type arithmetic expressions into the amount field. A plain number behaves
exactly as today. The moment the input contains an operator or parenthesis, a muted
`= XXX` hint appears below the field showing the evaluated result. Supports `+`, `-`,
`*`, `/`, parentheses, decimals, and operator precedence.

The calculator lives in the shared `AmountInput` component
(`web/src/components/amount-input.tsx`), so the expense, transfer, and recurring-expense
modals all get it with no per-modal changes.

## Current State

- `AmountInput` renders `<Input type="number" step="0.01">` + a currency `Combobox`,
  wrapped in `ButtonGroup`.
- It is **fully controlled** by a numeric `amount`:
  - `value={inputValue?.amount || ""}`
  - `onChange` reads `event.target.valueAsNumber` and calls
    `onValueChange({ ...inputValue, amount })`.
- The three modals store `amountWithCurrency: { amount: number; currency: string }` in a
  react-hook-form value, validated by Zod (`amount` must be a positive number). The
  numeric `amount` also feeds `PeopleSelector` (split preview) and the submit mutation.
- Vitest is installed (`@vitest/browser-playwright`, `@storybook/addon-vitest`); there is
  no plain `test` npm script yet.

The core constraint: a `type="number"` input **cannot** hold `(`, `)`, `+`, `*`, so the
input must become `type="text"`. That breaks the current "value is the number" model, so
the component needs an internal raw-text state distinct from the numeric `amount` it
reports upward.

## Architecture Decisions

### 1. Keep the public contract numeric — add internal text state

`AmountInput`'s `onValueChange` keeps emitting `{ amount: number; currency }`. The form,
Zod validation, `PeopleSelector`, and submit logic all stay unchanged — they never see the
raw expression. Internally the component holds a `rawAmount: string` (what the user sees
and types). On each keystroke it evaluates `rawAmount` → number and reports that number up.

This isolates the whole feature to one component and one new lib file.

### 2. Hand-written recursive-descent evaluator — no `eval`, no dependency

Per `feedback_split_algorithm_files.md`, the parser goes in its own file:
`web/src/lib/calc-expression.ts`. A small recursive-descent parser handles precedence
and parentheses safely (never use `eval`/`Function`). Returns a discriminated result so
the UI can distinguish "plain number", "valid expression", and "invalid".

### 3. Show the hint via `FieldDescription`, rendered inside `AmountInput`

Render the `= XXX` hint inside `AmountInput` (below the `ButtonGroup`) so all three modals
get it automatically. Use the existing `FieldDescription` primitive
(`feedback_use_shadcn_primitives.md`) for muted styling. The hint shows **only** when the
input is a non-trivial expression — never for a plain number.

---

## Implementation Steps

### 1. Expression evaluator — `web/src/lib/calc-expression.ts` (new)

Pure module, no React. Grammar (standard precedence):

```
expr   := term (('+' | '-') term)*
term   := factor (('*' | '/') factor)*
factor := number | '(' expr ')' | ('+' | '-') factor   // unary +/-
number := \d+(\.\d+)? | \.\d+
```

Public API:

```ts
export type EvalResult =
  | { kind: "empty" }                      // "" / whitespace only
  | { kind: "number"; value: number }      // a plain literal, e.g. "42.5" — no hint
  | { kind: "expression"; value: number }  // valid expression — show "= value"
  | { kind: "invalid" };                   // malformed — amount is NaN, hint optional

export function evaluateAmount(input: string): EvalResult;
```

- `isExpression` = trimmed input matches more than a bare decimal literal (i.e. contains
  any of `+ - * / ( )`, ignoring a single leading sign). Decide `number` vs `expression`
  on this, then parse.
- Tokenizer: walk the string, emit number / operator / paren tokens; reject unknown chars.
- Parser: recursive descent per grammar above; surface parse failure as `invalid`.
- Division by zero → `invalid` (don't emit `Infinity`).
- Keep full float precision here; rounding/formatting is the UI's job.

### 2. Refactor `AmountInput` — `web/src/components/amount-input.tsx`

Change the input to text and drive it from internal raw state:

- `const [rawAmount, setRawAmount] = useState<string>(() => formatInitial(inputValue?.amount));`
- Replace `type="number" step="0.01"` with `type="text" inputMode="decimal"`
  (keeps the mobile numeric-ish keypad; allows operator chars).
- `value={rawAmount}`.
- `onChange`:
  ```ts
  const text = event.target.value;
  setRawAmount(text);
  const result = evaluateAmount(text);
  const amount = result.kind === "number" || result.kind === "expression" ? result.value : NaN;
  onValueChange?.({ ...inputValue!, amount });
  ```
  Emitting `NaN` for empty/invalid lets the existing Zod rule ("Amount must be a number" /
  "positive number") fire naturally — no schema change.
- **Sync from outside** (edit-mode prefill, `form.reset()` on open): an effect that, when
  `inputValue?.amount` changes and does **not** equal the current evaluated value of
  `rawAmount`, resets `rawAmount` from the incoming number. The equality guard prevents a
  feedback loop while the user is typing (type → emit amount → inputValue updates → guard
  sees match → no reset).
- **Hint rendering** below the `ButtonGroup`:
  ```tsx
  {result.kind === "expression" && (
    <FieldDescription>= {formatResult(result.value, inputValue?.currency)}</FieldDescription>
  )}
  ```
  Compute `result` once per render from `rawAmount` (`useMemo`). Format to 2 decimals;
  appending the currency code is optional (recommend yes, matches the selector).
- Currency change handler is unchanged.

Note: `inputValue.amount || ""` previously hid `0`; mirror that in `formatInitial` (treat
0 / undefined as empty string so the placeholder shows).

### 3. Update the Storybook story — `web/src/components/amount-input.stories.tsx`

Add a story seeded so the expression hint is visible (e.g. default value `"(10+5)*2"`),
and confirm existing stories still render with the text input. If the project's
`addon-vitest` runs story-based tests, ensure they pass.

### 4. Unit tests for the evaluator

Add `web/src/lib/calc-expression.test.ts` covering:

- Plain number → `{ kind: "number" }` (no hint).
- `2+3*4` → `14` (precedence).
- `(10+5)*2` → `30` (parens).
- Decimals: `1.5+2.25` → `3.75`.
- Unary minus: `-5+10` → `5`.
- Whitespace tolerance: `10 + 5`.
- Invalid: `(10+`, `10++2`, `abc`, `10/0` → `{ kind: "invalid" }`.
- Empty/whitespace → `{ kind: "empty" }`.

Run with `npx vitest run src/lib/calc-expression.test.ts` (optionally add a `"test":
"vitest"` npm script).

---

## Edge Cases & Decisions

- **Plain number shows no hint** — the `= XXX` line appears only for `kind: "expression"`,
  matching the requested behavior.
- **Invalid mid-typing** (`(10+`) — no hint (or a faint "invalid expression"; recommend no
  hint to avoid noise). Amount is `NaN`, so the form can't submit until it's valid.
- **No live rounding of the typed text** — the user's raw string is preserved; only the
  hint and the reported numeric `amount` are derived. Submit already converts to cents via
  `int64(amount * 100)`, so a result like `10/3` rounds at persistence as today.
- **Comma vs dot decimals** — out of scope; assume `.` decimal separator (consistent with
  the current `type="number"` behavior).
- **Accessibility** — `inputMode="decimal"` keeps a numeric-friendly mobile keyboard;
  `type="text"` is required for operator characters. `aria-invalid` wiring is unchanged.

## Verification

1. `npx tsc -b --noEmit` (clean) and `npm run lint`.
2. `npx vitest run` for the evaluator tests.
3. `just dev`, then in the **expense** modal:
   - Type `42.50` → no hint, split preview and submit work as before.
   - Type `(10+5)*2` → `= 30.00` appears; submit records 30.
   - Type `100/3` → `= 33.33` (hint rounded), submit persists the full-precision value.
   - Type `(10+` → no hint, form blocks submit.
   - Edit an existing expense → field prefills with the stored number, no hint.
4. Spot-check the **transfer** and **recurring-expense** modals — same behavior, no
   regressions.
