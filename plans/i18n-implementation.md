# Internationalization (i18n) Implementation Plan

## Executive Summary

This plan outlines the strategy to add internationalization support to Pennywise. The key insight is leveraging **buf.validate's structured violations** for backend error localization - the `Violation` message includes `rule_id` and `field` paths that the frontend can map to localized messages without hardcoding error strings in the backend.

---

## Current State Analysis

### Frontend (`web/`)
- **Framework:** React 19, TypeScript, Vite
- **Component count:** 58 TSX files with user-facing text
- **Estimated strings:** 150-200 unique translatable strings
- **Error handling:** Currently just `toast.error(err.message)` - doesn't use structured violations
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

**1.1 Install buf.validate types**

```bash
cd web
npm install @bufbuild/protovalidate
```

Or generate from buf.build BSR:
```bash
# Add to buf.gen.yaml
- remote: buf.build/bufbuild/protovalidate
```

**1.2 Create violation extraction utility**

Create `web/src/lib/validation-errors.ts`:
```typescript
import type { ConnectError } from "@connectrpc/connect";
import { Violations } from "@buf/bufbuild_protovalidate.bufbuild_es/buf/validate/validate_pb";

export interface ParsedViolation {
  field: string;      // e.g., "email", "amount"
  ruleId: string;     // e.g., "string.email", "double.gt"
  message: string;    // Default English message
  forKey: boolean;
}

export function extractViolations(error: ConnectError): ParsedViolation[] {
  const violations: ParsedViolation[] = [];

  for (const detail of error.details) {
    if (detail.type === Violations.typeName) {
      const v = detail.value as Violations;
      for (const violation of v.violations) {
        violations.push({
          field: violation.field?.elements.map(e => e.fieldName).join('.') ?? '',
          ruleId: violation.ruleId ?? '',
          message: violation.message ?? '',
          forKey: violation.forKey ?? false,
        });
      }
    }
  }

  return violations;
}
```

**1.3 Map rule IDs to translation keys**

Create `web/src/lib/validation-i18n.ts`:
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

Update `web/src/lib/utils.ts`:
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

Create `web/src/i18n/index.ts`:
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

Create `web/src/i18n/locales/en.json`:
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

Update `web/src/main.tsx`:
```typescript
import './i18n';
```

### Phase 5: Migrate Components

**Migration order (by priority):**
1. Validation error messages (handled via rule_id mapping)
2. Authentication forms
3. Navigation and sidebar
4. Expense/Transfer modals
5. Group components
6. Settings page
7. Toast messages

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

Create `web/src/lib/format.ts`:
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

Add to Settings page:
```typescript
import { useTranslation } from 'react-i18next';

const languages = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Espanol' },
  { code: 'de', name: 'Deutsch' },
];

function LanguageSelector() {
  const { i18n } = useTranslation();

  return (
    <Select value={i18n.language} onValueChange={(lang) => i18n.changeLanguage(lang)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {languages.map((lang) => (
          <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

---

## File Changes Summary

### New Files
```
errors/codes.go                          # Business error codes
web/src/i18n/index.ts                    # i18n configuration
web/src/i18n/locales/en.json             # English translations
web/src/lib/validation-errors.ts         # Violation extraction
web/src/lib/validation-i18n.ts           # Rule ID to translation mapping
web/src/lib/format.ts                    # Date/number formatting
web/src/components/language-selector.tsx # Language picker
```

### Modified Files
```
proto/api/v1/transfer.proto              # Add CEL rules with IDs
http/routes/transfer/transfer.go         # Use NewBusinessError
http/routes/group/group.go               # Use NewBusinessError
http/routes/auth/auth_handler.go         # Use NewBusinessError
web/package.json                         # Add i18n dependencies
web/src/main.tsx                         # Import i18n
web/src/lib/utils.ts                     # Update handleError
web/src/routes/_pathlessLayout/settings.tsx # Add language selector
# All 50+ component files with user-facing text
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

### PR 8+: Additional Languages
- Add translation files
- Register in i18n config

---

## Key Benefits of This Approach

1. **Single source of truth:** Error codes defined once in proto/backend, frontend maps to translations
2. **Type-safe:** buf.validate violations are strongly typed
3. **Backwards compatible:** Default English messages still work if translation missing
4. **Field-level errors:** Can show validation errors on specific form fields
5. **Consistent:** Same pattern for proto validation and business logic errors

---

## References

- [protovalidate PR #265 - Structured Field and Rule Paths](https://github.com/bufbuild/protovalidate/pull/265)
- [protovalidate GitHub](https://github.com/bufbuild/protovalidate)
- [connectrpc.com/validate](https://github.com/connectrpc/validate-go)
- [react-i18next](https://react.i18next.com/)
