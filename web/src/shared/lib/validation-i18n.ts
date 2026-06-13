import i18n from "@/i18n";

import type { ParsedViolation } from "./validation-errors";

// Maps buf.validate rule IDs (standard rules + our custom business rule IDs from
// errors/codes.go) to translation keys under "validation.*". Rules not listed
// here fall back to the backend's English message.
const ruleIdToKey: Record<string, string> = {
  "string.email": "validation.email",
  "string.uuid": "validation.uuid",
  "double.gt": "validation.positiveNumber",
  "int64.gt": "validation.positiveNumber",
  // Custom business rules (errors/codes.go)
  "auth.invalid_password": "validation.invalidPassword",
  "auth.password_login_disabled": "validation.passwordLoginDisabled",
  "auth.registration_disabled": "validation.registrationDisabled",
  "transfer.sender_not_member": "validation.senderNotMember",
  "transfer.receiver_not_member": "validation.receiverNotMember",
  "transfer.same_user": "validation.sameUser",
  "group.member_exists": "validation.memberExists",
  "group.not_member": "validation.notMember",
  "group.default_currency": "validation.defaultCurrency",
};

// Translation keys for known field names, so messages can say "Email" rather
// than the raw proto field name.
const fieldToKey: Record<string, string> = {
  email: "fields.email",
  password: "fields.password",
  username: "fields.username",
  amount: "fields.amount",
  name: "fields.name",
  currency: "fields.currency",
  description: "fields.description",
  sender_id: "fields.sender_id",
  receiver_id: "fields.receiver_id",
  user_id: "fields.user_id",
  default_currency: "fields.default_currency",
};

// Rule and field keys are resolved at runtime from the maps above, so they are
// plain strings rather than the literal key union i18next's typed t() expects.
const t = i18n.t as (key: string, options?: Record<string, unknown>) => string;

export function translateViolation(violation: ParsedViolation): string {
  const ruleKey = ruleIdToKey[violation.ruleId];

  if (ruleKey) {
    const fieldKey = fieldToKey[violation.field];
    const field = fieldKey ? t(fieldKey) : violation.field;
    return t(ruleKey, { field });
  }

  // Fall back to the backend's default English message for unmapped rules.
  return violation.message;
}

export function translateViolations(violations: ParsedViolation[]): string[] {
  return violations.map(translateViolation);
}
