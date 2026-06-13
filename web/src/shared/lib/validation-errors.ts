import type { ConnectError } from "@connectrpc/connect";

import { ViolationsSchema } from "@/gen/buf/validate/validate_pb";

export interface ParsedViolation {
  /** Dotted field path the violation applies to, e.g. "email" or "" for form-level. */
  field: string;
  /** Stable rule identifier, e.g. "string.email" or "transfer.same_user". */
  ruleId: string;
  /** Default English message from the backend, used as a fallback. */
  message: string;
  forKey: boolean;
}

/**
 * Extracts buf.validate violations from a ConnectError. Both proto validation
 * failures and our backend business errors (see errors/codes.go) attach a
 * buf.validate.Violations detail, so this works uniformly for both.
 */
export function extractViolations(error: ConnectError): ParsedViolation[] {
  const violations: ParsedViolation[] = [];

  for (const violationsMsg of error.findDetails(ViolationsSchema)) {
    for (const v of violationsMsg.violations) {
      violations.push({
        field: v.field?.elements.map((e) => e.fieldName).join(".") ?? "",
        ruleId: v.ruleId ?? "",
        message: v.message ?? "",
        forKey: v.forKey ?? false,
      });
    }
  }

  return violations;
}
