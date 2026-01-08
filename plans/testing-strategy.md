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

## Integration Tests (10-15 tests) - HIGHEST PRIORITY

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
| Integration | 10-15 | All API endpoints with real DB |
| E2E | 3-5 | Critical user journeys |

**Total: ~20 tests**

---

## Implementation Order

1. **Integration tests first** - highest ROI, catches most bugs
2. **Keep existing unit tests** - `calc/balance_test.go` already covers core math
3. **E2E tests last** - slowest to run, add after integration tests are stable

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
