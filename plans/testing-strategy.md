# Testing Strategy for Pennywise

Following Kent C. Dodds' "testing trophy": few unit tests, most integration tests, some E2E tests.

**Goal:** Minimal tests, maximum impact (~20 total tests)

---

## Unit Tests (3-5 tests)

Pure logic with no dependencies. Already exists in `calc/balance_test.go`.

### 1. Balance Calculation (`calc/balance.go`)

Keep existing tests covering:
- Weighted expense splitting with rounding correctness
- Multi-currency balance separation
- Transfer balance effects (sender +, receiver -)
- Edge cases: unequal weights, partial settlements

### 2. Amount Conversion (add if missing)

```go
func TestAmountConversion(t *testing.T) {
    // Verify cents conversion round-trips without loss
    // 21.37 -> 2137 cents -> 21.37
    // 0.01 -> 1 cent -> 0.01
    // Large amounts don't overflow
}
```

---

## Backend Integration Tests (10-15 tests) - HIGHEST PRIORITY

Test against real SQLite (in-memory) with actual HTTP handlers. This is where most bugs are caught.

### Test Structure

```
tests/
  integration/
    setup_test.go      # Test helpers, DB setup
    expense_test.go    # Expense CRUD + balance verification
    transfer_test.go   # Transfer CRUD + balance verification
    group_test.go      # Membership, permissions, cascade deletes
    auth_test.go       # Login/register/session
```

### 1. Expense Flow (highest value)

```go
func TestExpenseFlow(t *testing.T) {
    // Setup: create user, group, add 2 members (Alice, Bob)

    // Create expense: Alice pays $30, split with Bob
    // Assert: GetGroupActivity shows expense
    // Assert: GetUserGroups returns correct balances (Alice +15, Bob -15)

    // Update expense: change amount to $20
    // Assert: balances updated (Alice +10, Bob -10)

    // Delete expense
    // Assert: balances reset to 0
}
```

### 2. Transfer Flow

```go
func TestTransferFlow(t *testing.T) {
    // Setup: group with Alice (-$10) and Bob (+$10) from expense

    // Create transfer: Bob sends $10 to Alice
    // Assert: balances settle to 0
    // Assert: activity shows both expense and transfer in correct order
}
```

### 3. Group Membership & Permissions

```go
func TestGroupPermissions(t *testing.T) {
    // Creator can delete group -> succeeds
    // Non-creator cannot delete group -> CodePermissionDenied
}

func TestGroupCascadeDelete(t *testing.T) {
    // Create group with expenses and transfers
    // Delete group
    // Assert: all related expenses/transfers deleted
}

func TestWeightUpdates(t *testing.T) {
    // Create expense with equal weights
    // Change member weight to 2.0
    // Create new expense
    // Assert: new expense uses updated weights
}
```

### 4. Auth Flow

```go
func TestAuthFlow(t *testing.T) {
    // Register -> creates user, sets session cookie
    // Login with valid credentials -> succeeds, sets cookie
    // Login with invalid credentials -> CodeUnauthenticated
    // Authenticated endpoint without session -> CodeUnauthenticated
}
```

### 5. Validation

```go
func TestInputValidation(t *testing.T) {
    // Invalid UUID -> CodeInvalidArgument
    // Amount <= 0 -> CodeInvalidArgument
    // Empty currency -> CodeInvalidArgument
    // Self-transfer (sender == receiver) -> CodeInvalidArgument
}
```

### 6. Multi-Currency

```go
func TestMultiCurrencyBalances(t *testing.T) {
    // Create expense in USD
    // Create expense in EUR
    // Assert: balances separated by currency
    // Assert: GetUserGroups shows both currencies
}
```

---

## Frontend Component/Integration Tests (3-5 tests)

Render real components against a **mocked Connect transport** in jsdom — no browser, no backend. This is the frontend analogue of the Go integration tier: it covers component logic that unit tests can't reach and that E2E covers too slowly to be worth the permutations.

**Infra already in place** (don't re-add): Vitest is configured in `vite.config.ts` with a `component` project (`environment: "jsdom"`, matches `src/**/*.test.tsx`). `@testing-library/react`, `jsdom`, and `@vitest/coverage-v8` are installed; `npm test` runs them. The `unit` project already runs `calc-expression.test.ts`. What's missing is a render wrapper + mock transport and any `*.test.tsx` files.

### Render wrapper + mock transport

```tsx
// src/test/render.tsx
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { Transport } from "@connectrpc/connect";

export function renderWithProviders(ui: React.ReactNode, transport: Transport) {
  // Fresh client per test; no retries so error paths resolve immediately.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </TransportProvider>,
  );
}
```

Use `createRouterTransport` from `@connectrpc/connect` to stub service methods in-memory (success and error cases), instead of mocking `fetch`:

```tsx
import { createRouterTransport } from "@connectrpc/connect";
import { ExpenseService } from "@/gen/api/v1/expense_pb";

const transport = createRouterTransport(({ service }) => {
  service(ExpenseService, {
    createExpense: () => ({ /* ...response */ }),
  });
});
```

### What to test (3-5, not more)

1. **Amount input + `calc-expression` wired into the form** — the `,`→`.` handling (commit `d656e78`) and expression evaluation as the user actually triggers it through `amount-input`, not just the pure evaluator (already unit-tested).
2. **Expense modal validation + submit** — required fields and amount > 0 block submit; a valid submit calls the mocked `createExpense`; a mocked error surfaces via `handleError`/toast.
3. **`use-group-mutations` cache behavior** — render with a mock transport, fire `deleteExpense`, assert the success toast fires and the `getGroupActivity`/`getUserGroups` query keys are invalidated. (Note: this hook invalidates-on-success; it is **not** optimistic, despite the CLAUDE.md description — don't write rollback assertions.)
4. **Query-state rendering** (optional) — a component shows loading → empty/error → data screens driven by the mocked transport.

---

## E2E Tests (3-5 tests)

Use Playwright. Test critical user paths through the actual UI.

### Setup

```
web/
  e2e/
    auth.spec.ts
    expense-workflow.spec.ts
    multi-currency.spec.ts
```

### 1. Complete User Journey (single test, highest value)

```typescript
test('full expense workflow', async ({ page }) => {
    // Register new user
    await page.goto('/auth/register');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Create group "Trip to Paris"
    await page.click('[data-testid="create-group"]');
    await page.fill('[name="name"]', 'Trip to Paris');
    await page.click('button[type="submit"]');

    // Add expense: "Dinner" $60
    await page.click('[data-testid="add-expense"]');
    await page.fill('[name="name"]', 'Dinner');
    await page.fill('[name="amount"]', '60');
    await page.click('button[type="submit"]');

    // Verify balance cards show correct amounts
    await expect(page.locator('[data-testid="balance-card"]')).toContainText('$30');

    // Create transfer to settle
    await page.click('[data-testid="add-transfer"]');
    // ... fill transfer form

    // Verify balances update
    await expect(page.locator('[data-testid="balance-card"]')).toContainText('$0');

    // Delete expense
    // Verify activity feed updates
});
```

### 2. Multi-Currency Display

```typescript
test('multi-currency balances display correctly', async ({ page }) => {
    // Login to existing account with multi-currency group
    // Navigate to group page
    // Verify balance cards show separate rows for USD, EUR, GBP
});
```

### 3. Auth Protection

```typescript
test('protected routes redirect to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/auth/login');

    await page.goto('/group/some-id');
    await expect(page).toHaveURL('/auth/login');
});
```

---

## Test Coverage Summary

| Layer | Tests | Focus |
|-------|-------|-------|
| Unit | 3-5 | Balance math, amount conversion |
| Backend integration | 10-15 | All API endpoints with real DB |
| Frontend component/integration | 3-5 | Forms, validation, mutation cache effects (mocked transport) |
| E2E | 3-5 | Critical user journeys |

**Total: ~25 tests**

---

## Implementation Order

1. **Backend integration tests first** - highest ROI, catches most bugs
2. **Keep existing unit tests** - `calc/balance_test.go` already covers core math
3. **Frontend component/integration tests** - infra (Vitest/jsdom/RTL) already exists; add the render wrapper + mock transport, then the 3-5 tests
4. **E2E tests last** - slowest to run, add after the others are stable

---

## Test Infrastructure Needed

### Backend (Go)

```go
// tests/integration/setup_test.go
package integration

import (
    "database/sql"
    "testing"

    _ "github.com/mattn/go-sqlite3"
)

func setupTestDB(t *testing.T) *sql.DB {
    db, err := sql.Open("sqlite3", ":memory:")
    if err != nil {
        t.Fatal(err)
    }

    // Run migrations
    // Initialize db.WriteQueries, db.ReadQueries

    t.Cleanup(func() { db.Close() })
    return db
}

func createTestUser(t *testing.T, email string) string {
    // Helper to create user, returns user ID
}

func createTestGroup(t *testing.T, creatorID string) string {
    // Helper to create group, returns group ID
}
```

### Frontend (Playwright)

```typescript
// web/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    baseURL: 'http://localhost:5173',
    use: {
        trace: 'on-first-retry',
    },
});
```

---

## What NOT to Test

- UI component styling (use visual regression if needed later)
- Third-party libraries (shadcn/ui, TanStack Query)
- Generated code (protobuf, sqlc)
- Happy path variations that don't add coverage
