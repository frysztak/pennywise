# Internationalization (i18n) Implementation Plan

> **Status (2026-06-09): Not started.** None of this has been implemented yet —
> there is no `web/src/shared/i18n/` directory, no i18n dependencies in
> `web/package.json`, no `errors/` Go package, and `handleError` is still a bare
> `toast.error(err.message)`. The strategy below remains valid; file paths have
> been updated to match the current **feature-based** frontend layout
> (`src/features/` + `src/shared/`).

## Executive Summary

This plan outlines the strategy to add internationalization support to Pennywise. The key insight is leveraging **buf.validate's structured violations** for backend error localization - the `Violation` message includes `rule_id` and `field` paths that the frontend can map to localized messages without hardcoding error strings in the backend.

---

## Current State Analysis

### Frontend (`web/`)
- **Framework:** React 19, TypeScript, Vite
- **Architecture:** Feature-based — domain code lives under `src/features/<name>/`,
  cross-cutting code under `src/shared/` (`shared/components/`, `shared/hooks/`,
  `shared/lib/`). New i18n infra belongs in `src/shared/`.
- **Component count:** ~128 TSX files (many with user-facing text)
- **Estimated strings:** 200-300 unique translatable strings
- **Error handling:** Currently just `toast.error(err.message)` in
  `web/src/shared/lib/utils.ts` - doesn't use structured violations
- **Current i18n:** None

### Backend (`/`)
- **Framework:** Go 1.25, Connect RPC
- **Validation:** buf.validate via `connectrpc.com/validate v0.6.0`
- **User-facing errors:** ~9 custom business logic errors
- **Current i18n:** None

---

## Backend Strategy: Structured Error Codes via buf.validate

### How buf.validate Violations Work

When validation fails, the interceptor returns a `connect.CodeInvalidArgument` error with `buf.validate.Violations` attached as error details. Each `Violation` contains:

```protobuf
message Violation {
  optional FieldPath field = 5;    // Which field failed (e.g., ["email"])
  optional FieldPath rule = 6;     // Which rule failed (e.g., ["string", "email"])
  optional string rule_id = 2;     // Rule identifier (e.g., "string.email")
  optional string message = 3;     // Default English message
  optional bool for_key = 4;       // For map key violations
}
```

**Key insight:** The `rule_id` provides a stable identifier that the frontend can map to localized messages. Standard rules have predictable IDs:
- `string.email` - Email format validation
- `string.min_len` - Minimum length
- `string.uuid` - UUID format
- `double.gt` - Greater than (for amounts)

### Phase 1: Extract Violations on Frontend

**1.1 buf.validate types are already generated — no install needed**

`web/buf.gen.yaml` uses `include_imports: true`, so the protobuf-es types for
`buf.validate` are already emitted at
`web/src/gen/buf/validate/validate_pb.ts`. Do **not** `npm install
@bufbuild/protovalidate` or add a BSR remote — import the generated
`ViolationsSchema` from `@/gen/buf/validate/validate_pb`.

**1.2 Create violation extraction utility**

This codebase uses **protobuf-es v2** (`protoc-gen-es target=ts`), where messages
are plain objects and schemas are separate `*Schema` descriptors. Use Connect's
`ConnectError.findDetails(schema)` rather than manually iterating `error.details`
(the v1-style `detail.type === Violations.typeName` does not exist in v2).

Create `web/src/shared/lib/validation-errors.ts`:
```typescript
import { ConnectError } from "@connectrpc/connect";
import { ViolationsSchema } from "@/gen/buf/validate/validate_pb";

export interface ParsedViolation {
  field: string;      // e.g., "email", "amount"
  ruleId: string;     // e.g., "string.email", "double.gt"
  message: string;    // Default English message
  forKey: boolean;
}

export function extractViolations(error: unknown): ParsedViolation[] {
  const connectErr = ConnectError.from(error);
  const result: ParsedViolation[] = [];

  // findDetails decodes all matching details into Violations messages
  for (const v of connectErr.findDetails(ViolationsSchema)) {
    for (const violation of v.violations) {
      result.push({
        field: violation.field?.elements.map((e) => e.fieldName).join(".") ?? "",
        ruleId: violation.ruleId ?? "",
        message: violation.message ?? "",
        forKey: violation.forKey ?? false,
      });
    }
  }

  return result;
}
```

**1.3 Map rule IDs to translation keys**

Create `web/src/shared/lib/validation-i18n.ts`:
```typescript
import i18n from '../i18n';
import type { ParsedViolation } from './validation-errors';

// Maps buf.validate rule IDs to translation keys
const ruleIdToKey: Record<string, string> = {
  'string.email': 'validation.email',
  'string.min_len': 'validation.minLength',
  'string.uuid': 'validation.uuid',
  'double.gt': 'validation.positiveNumber',
  'int64.gt': 'validation.positiveNumber',
  // Custom CEL rules use their `id` field
  'auth.invalid_password': 'validation.invalidPassword',
  'transfer.sender_not_member': 'validation.senderNotMember',
  'transfer.receiver_not_member': 'validation.receiverNotMember',
  'transfer.same_user': 'validation.sameUser',
  'group.member_exists': 'validation.memberExists',
  'group.not_member': 'validation.notMember',
};

// Field names to translation keys (for field-specific messages)
const fieldToKey: Record<string, string> = {
  'email': 'fields.email',
  'password': 'fields.password',
  'username': 'fields.username',
  'amount': 'fields.amount',
  'name': 'fields.name',
};

export function translateViolation(violation: ParsedViolation): string {
  const ruleKey = ruleIdToKey[violation.ruleId];
  const fieldKey = fieldToKey[violation.field];

  if (ruleKey) {
    // Use localized message with field name interpolation
    const fieldName = fieldKey ? i18n.t(fieldKey) : violation.field;
    return i18n.t(ruleKey, { field: fieldName });
  }

  // Fallback to default message from backend
  return violation.message;
}

export function translateViolations(violations: ParsedViolation[]): string[] {
  return violations.map(translateViolation);
}
```

### Phase 2: Add Custom Rule IDs to Proto Files

For business logic errors, add CEL rules with meaningful `id` values that become `rule_id` in violations.

**2.1 Update transfer.proto**

```protobuf
message CreateTransferRequest {
  string group_id = 1 [(buf.validate.field).string.uuid = true];
  string sender_id = 2 [(buf.validate.field).string.uuid = true];
  string receiver_id = 3 [
    (buf.validate.field).string.uuid = true,
    (buf.validate.field).cel = {
      id: "transfer.same_user"
      message: "sender and receiver must be different"
      expression: "this != sender_id"  // CEL can reference sibling fields
    }
  ];
  double amount = 4 [(buf.validate.field).double.gt = 0.0];
  string currency = 5 [(buf.validate.field).string.min_len = 2];
  google.protobuf.Timestamp date = 6;
}
```

**Note:** Some business logic (like checking group membership) requires database lookups and cannot be done in proto validation. For these cases, return custom Connect errors with error details.

**2.2 Create custom error codes for business logic**

Create `errors/codes.go`:
```go
package errors

import (
    "connectrpc.com/connect"
    validatepb "buf.build/gen/go/bufbuild/protovalidate/protocolbuffers/go/buf/validate"
)

// Error codes for business logic (not expressible in proto validation)
const (
    CodeSenderNotMember    = "transfer.sender_not_member"
    CodeReceiverNotMember  = "transfer.receiver_not_member"
    CodeMemberExists       = "group.member_exists"
    CodeNotMember          = "group.not_member"
    CodeInvalidPassword    = "auth.invalid_password"
)

// NewBusinessError creates a Connect error with a Violations detail
// that the frontend can parse just like validation errors
func NewBusinessError(code connect.Code, ruleId string, field string, message string) *connect.Error {
    err := connect.NewError(code, nil)

    violation := &validatepb.Violation{
        RuleId:  &ruleId,
        Message: &message,
    }
    if field != "" {
        violation.Field = &validatepb.FieldPath{
            Elements: []*validatepb.FieldPathElement{
                {FieldName: &field},
            },
        }
    }

    violations := &validatepb.Violations{
        Violations: []*validatepb.Violation{violation},
    }

    if detail, detailErr := connect.NewErrorDetail(violations); detailErr == nil {
        err.AddDetail(detail)
    }

    return err
}
```

**2.3 Update handlers to use structured errors**

Update `http/routes/transfer/transfer.go`:
```go
import "pennywise/errors"

// Instead of:
return nil, connect.NewError(connect.CodeInvalidArgument,
    errors.New("sender is not a member of this group"))

// Use:
return nil, errors.NewBusinessError(
    connect.CodeInvalidArgument,
    errors.CodeSenderNotMember,
    "sender_id",
    "sender is not a member of this group", // English fallback
)
```

### Phase 3: Frontend Error Handling

**3.1 Update handleError utility**

Update `web/src/shared/lib/utils.ts`:
```typescript
import type { ConnectError } from "@connectrpc/connect";
import { toast } from "sonner";
import { extractViolations, type ParsedViolation } from "./validation-errors";
import { translateViolations } from "./validation-i18n";

export function handleError(err: ConnectError) {
  const violations = extractViolations(err);

  if (violations.length > 0) {
    // Show localized validation errors
    const messages = translateViolations(violations);
    messages.forEach(msg => toast.error(msg));
  } else {
    // Fallback for non-validation errors
    toast.error(err.message);
  }
}

// For form integration - returns field-level errors
export function getFieldErrors(err: ConnectError): Record<string, string> {
  const violations = extractViolations(err);
  const fieldErrors: Record<string, string> = {};

  for (const v of violations) {
    if (v.field && !fieldErrors[v.field]) {
      fieldErrors[v.field] = translateViolation(v);
    }
  }

  return fieldErrors;
}
```

**3.2 Integrate with React Hook Form**

```typescript
import { getFieldErrors } from "@/lib/utils";

const mutation = useMutation({
  mutationFn: createExpense,
  onError: (err: ConnectError) => {
    const fieldErrors = getFieldErrors(err);

    // Set errors on specific form fields
    Object.entries(fieldErrors).forEach(([field, message]) => {
      form.setError(field as any, { message });
    });

    // Show toast for non-field errors
    if (Object.keys(fieldErrors).length === 0) {
      handleError(err);
    }
  },
});
```

---

## Frontend i18n Implementation

### Phase 4: Setup i18n Infrastructure

**4.1 Install dependencies**

```bash
cd web
npm install i18next react-i18next i18next-browser-languagedetector
npm install -D i18next-parser
```

**4.2 Create i18n configuration**

Create `web/src/shared/i18n/index.ts`:
```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
```

**4.3 Create translation file**

Create `web/src/shared/i18n/locales/en.json`:
```json
{
  "validation": {
    "email": "Please enter a valid email address",
    "minLength": "{{field}} must be at least {{min}} characters",
    "uuid": "Invalid {{field}} format",
    "positiveNumber": "{{field}} must be greater than 0",
    "invalidPassword": "Invalid password",
    "senderNotMember": "Sender is not a member of this group",
    "receiverNotMember": "Receiver is not a member of this group",
    "sameUser": "Sender and receiver must be different",
    "memberExists": "User is already a member of this group",
    "notMember": "User is not a member of this group",
    "required": "This field is required",
    "passwordMatch": "Passwords don't match"
  },
  "fields": {
    "email": "Email",
    "password": "Password",
    "username": "Username",
    "amount": "Amount",
    "name": "Name",
    "currency": "Currency",
    "description": "Description"
  },
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "add": "Add",
    "submit": "Submit",
    "close": "Close"
  },
  "auth": {
    "login": {
      "title": "Login to your account",
      "description": "Enter your email below to login",
      "button": "Login",
      "noAccount": "Don't have an account?",
      "signUp": "Sign up"
    },
    "register": {
      "title": "Create an account",
      "description": "Enter your information below",
      "button": "Create Account",
      "hasAccount": "Already have an account?",
      "signIn": "Sign in"
    }
  },
  "expense": {
    "create": "Add new expense",
    "edit": "Edit expense",
    "created": "Expense created!",
    "updated": "Expense updated!",
    "deleted": "Expense deleted!"
  },
  "transfer": {
    "create": "Record transfer",
    "edit": "Edit transfer",
    "created": "Transfer recorded!",
    "updated": "Transfer updated!",
    "deleted": "Transfer deleted!"
  },
  "group": {
    "create": "Create expense group",
    "edit": "Edit Group",
    "delete": "Delete Group",
    "created": "Group created!",
    "updated": "Group updated!",
    "deleted": "Group deleted!",
    "memberAdded": "Member added to group!",
    "activity": {
      "title": "Activity",
      "empty": "No activity yet in this group."
    }
  },
  "dashboard": {
    "title": "Dashboard",
    "empty": {
      "title": "No expense groups yet",
      "description": "Create a group to start tracking shared expenses."
    }
  },
  "nav": {
    "dashboard": "Dashboard",
    "settings": "Settings",
    "logout": "Log out"
  }
}
```

**4.4 Initialize in app**

Update `web/src/main.tsx` (app-wide providers/setup are mounted at the root here):
```typescript
import './shared/i18n';
```

### Phase 5: Migrate Components

**Migration order (by priority), mapped to `src/features/`:**
1. Validation error messages (handled via rule_id mapping)
2. `features/auth/` - login/signup forms, OIDC providers
3. `features/sidebar/` - nav shell, new-group modal
4. `features/expense/` and `features/transfer/` - modals, delete dialogs
5. `features/group/` - activity feed, balances, settlement, group dialogs
6. `features/dashboard/` and `features/settings/`
7. `features/recurring-expense/`, `features/scan-receipt/`, `features/admin/`
   (these exist now and were not in the original draft's `en.json` scope)
8. Toast messages across all features

The `en.json` below is a starting point covering auth/expense/transfer/group/
dashboard/nav; it must be extended for recurring-expense, scan-receipt, and admin.

**Example component migration:**

Before:
```tsx
<DialogTitle>Add new expense</DialogTitle>
<Button>Cancel</Button>
```

After:
```tsx
import { useTranslation } from 'react-i18next';

function ExpenseModal() {
  const { t } = useTranslation();

  return (
    <>
      <DialogTitle>{t('expense.create')}</DialogTitle>
      <Button>{t('common.cancel')}</Button>
    </>
  );
}
```

### Phase 6: Date and Number Formatting

**Note:** A naive `formatCurrency(amount, currency)` already exists in
`web/src/shared/lib/utils.ts` (returns `` `${amount.toFixed(2)} ${currency}` ``).
This phase replaces it with a locale-aware `Intl`-based version — update the
existing function (and its callers) rather than introducing a parallel one. The
currency selectors intentionally show ISO codes only (no "USD - US Dollar"
labels), so keep that convention if surfacing currency names.

Create `web/src/shared/lib/format.ts` (or extend `shared/lib/utils.ts`):
```typescript
export function formatDate(date: Date | string, locale: string = 'en'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

export function formatCurrency(
  amount: number,
  currency: string,
  locale: string = 'en'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}
```

### Phase 7: Language Selector

Add a `LanguageSelector` in `web/src/features/settings/components/` and render it
from the settings route (`web/src/routes/_pathlessLayout/settings.tsx`).

**Important:** the UI `Select` is built on **Base UI** (`@base-ui/react/select`),
not Radix. It requires an `items` prop (`[{ value, label }]`) — omitting it has
bitten us before. The API differs from the Radix/shadcn snippet:

```tsx
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/shared/components/ui/select';

const languages = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
];

function LanguageSelector() {
  const { i18n } = useTranslation();

  return (
    <Select
      items={languages}
      value={i18n.language}
      onValueChange={(lang) => i18n.changeLanguage(lang)}
    >
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {languages.map((lang) => (
          <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

### Phase 8: Translation Management with Weblate

Weblate handles the *workflow* of translating into non-English languages; it does
**not** change the runtime (still i18next + bundled JSON). `en.json` remains the
single source of truth in the repo — the `i18next-parser` step (gap #2) writes it,
Weblate reads it as the source language and commits the other locales
(`es.json`, `de.json`, …) back to the repo.

**8.1 Hosting**

- **Open-source / libre:** use the free `hosted.weblate.org` tier.
- **Otherwise / for full control:** self-host (Docker compose); fits the app's
  self-hostable ethos.

**8.2 Repository layout for translations**

Keep all locales side-by-side so Weblate can manage them as one component:
```
web/src/shared/i18n/locales/
  en.json   # source (generated by i18next-parser; do not hand-edit translations into it)
  es.json   # managed by Weblate
  de.json   # managed by Weblate
```
If `en.json` grows unwieldy, split into per-feature namespace files
(`auth.json`, `group.json`, …) — this also enables lazy-loading and gives
translators better context. Each namespace becomes a Weblate component.

**8.3 Weblate component config**

- File format: **i18next JSON v4** (so Weblate understands the `_one` / `_other`
  plural suffixes from gap #6).
- Source language: `en`; source file: `en.json`; file mask:
  `web/src/shared/i18n/locales/*.json`.
- Connect Weblate to the git repo; enable "push on commit" so completed
  translations land as commits/PRs. Add a Weblate service user with push access
  (or PR-only) on the repo.

**8.4 CI hygiene (avoid fighting over key churn)**

- The `i18n:extract` step owns **keys** in `en.json`; Weblate owns **values** in
  the other locales. Run extraction in CI and fail the build if `en.json` is
  out of date, so new keys are never silently missing.
- Configure extraction to **not** prune or reorder existing keys in a way that
  thrashes Weblate's git history (use a stable key sort and `keepRemoved` as
  appropriate in `i18next-parser.config.js`).
- Treat the non-English `*.json` files as Weblate-managed: humans don't edit them
  directly in PRs.

---

## File Changes Summary

### New Files
```
errors/codes.go                                    # Business error codes
web/src/shared/i18n/index.ts                       # i18n configuration
web/src/shared/i18n/locales/en.json                # English translations
web/src/shared/lib/validation-errors.ts            # Violation extraction
web/src/shared/lib/validation-i18n.ts              # Rule ID to translation mapping
web/src/shared/lib/format.ts                       # Date/number formatting (or extend utils.ts)
web/src/features/settings/components/language-selector.tsx  # Language picker
```

### Modified Files
```
proto/api/v1/transfer.proto              # Add CEL rules with IDs
http/routes/transfer/transfer.go         # Use NewBusinessError
http/routes/group/group.go               # Use NewBusinessError
http/routes/auth/auth.go                 # Use NewBusinessError
web/package.json                         # Add i18n dependencies
web/src/main.tsx                         # Import i18n
web/src/shared/lib/utils.ts              # Update handleError, replace formatCurrency
web/src/routes/_pathlessLayout/settings.tsx # Render language selector
# ~128 TSX files under web/src/features/ and web/src/routes/ with user-facing text
```

---

## Implementation Order

### PR 1: Backend Error Structure
1. Create `errors/codes.go` with `NewBusinessError`
2. Update handlers to use structured errors
3. Test that violations appear in error details

### PR 2: Frontend Violation Handling
1. Add buf.validate types to frontend
2. Create violation extraction utilities
3. Update `handleError` to extract and translate violations
4. Add validation translation keys to en.json

### PR 3: i18n Infrastructure
1. Install react-i18next
2. Create i18n configuration
3. Create initial en.json with common strings
4. Add language selector to settings

### PR 4-7: Component Migration
- Migrate components incrementally by area
- Each PR is self-contained and deployable

### PR 8: Weblate Integration
- Stand up Weblate (hosted libre tier or self-hosted)
- Configure the component(s) against `en.json` as i18next JSON v4
- Wire git push-on-commit and CI extraction guard (Phase 8)

### PR 9+: Additional Languages
- Translators add locales via Weblate; new `*.json` files land via git sync
- Register each new language in the i18n config (`resources` + selector list)

---

## Key Benefits of This Approach

1. **Single source of truth:** Error codes defined once in proto/backend, frontend maps to translations
2. **Type-safe:** buf.validate violations are strongly typed
3. **Backwards compatible:** Default English messages still work if translation missing
4. **Field-level errors:** Can show validation errors on specific form fields
5. **Consistent:** Same pattern for proto validation and business logic errors

---

## Gaps & Open Questions

Topics the original draft did not cover but a complete implementation needs:

1. **Type-safe translation keys.** The project is strict TypeScript. Add
   `react-i18next` module augmentation (`declare module "i18next"` with a
   `CustomTypeOptions` resources type derived from `en.json`) so `t("expense.create")`
   is checked at compile time and autocompletes. Without this, key typos fail
   silently at runtime.

2. **Key-extraction workflow.** `i18next-parser` is listed as a dev dependency but
   no config (`i18next-parser.config.js`) or npm script is defined. Keeping
   `en.json` in sync with ~128 files by hand is not viable — add an
   `i18n:extract` script and run it as part of `just gen` / CI.

3. **Existing test suite.** There are component tests (e.g.
   `expense-modal.test.tsx`) that assert on English text. Migrating strings will
   break them. Decide on a test i18n setup (real `en.json` vs. a mock where
   `t(key) => key`) and update assertions accordingly.

4. **Strings live in hooks, not just components.** Success/error toasts are raised
   inside feature hooks (e.g. `use-delete-expense-modal.ts`,
   `use-group-mutations.ts`), not only JSX. These need `useTranslation()` (in
   hooks) or the imported `i18n` instance (in non-React modules like
   `validation-i18n.ts`).

5. **Language persistence.** The selector calls `changeLanguage` but persistence
   is unspecified. Configure `i18next-browser-languagedetector` to cache to
   `localStorage`, and decide whether to also persist to the user profile
   (the backend already stores user settings) so it follows the account across
   devices.

6. **Pluralization.** i18next plural keys (`_one` / `_other`) are needed for
   counts the UI shows (members, beneficiaries, expense counts). Not modeled in
   the `en.json` draft.

7. **Locale-aware formatting wiring.** Phase 6's formatters hardcode `locale = 'en'`.
   They should read the active language (`i18n.language`). `date-fns@4` is already
   a dependency (currently dates use `.toLocaleDateString()` with no locale) —
   decide between `Intl` and date-fns locales and apply consistently.

8. **`<html lang>` attribute.** Update `document.documentElement.lang` on language
   change for accessibility/SEO (e.g. via an i18next `languageChanged` listener).

9. **Translation scope.** State explicitly that user-generated content (group
   names, descriptions, currency codes) is **not** translated — only UI chrome,
   validation, and system messages.

10. **RTL.** The draft lists en/es/de (all LTR), so RTL is out of scope for now,
    but note it as a follow-up if Arabic/Hebrew are ever added (`dir` attribute +
    logical CSS properties).

## References

- [protovalidate PR #265 - Structured Field and Rule Paths](https://github.com/bufbuild/protovalidate/pull/265)
- [protovalidate GitHub](https://github.com/bufbuild/protovalidate)
- [connectrpc.com/validate](https://github.com/connectrpc/validate-go)
- [react-i18next](https://react.i18next.com/)
