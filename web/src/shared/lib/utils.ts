import type { ConnectError } from "@connectrpc/connect";
import { type ClassValue, clsx } from "clsx";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";

import { extractViolations } from "./validation-errors";
import { translateViolation, translateViolations } from "./validation-i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function handleError(err: ConnectError) {
  const violations = extractViolations(err);

  if (violations.length > 0) {
    for (const message of translateViolations(violations)) {
      toast.error(message);
    }
  } else {
    toast.error(err.message);
  }
}

/**
 * Returns localized, field-keyed validation errors for integrating with form
 * libraries (e.g. react-hook-form's setError). Only the first violation per
 * field is kept.
 */
export function getFieldErrors(err: ConnectError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const v of extractViolations(err)) {
    if (v.field && !fieldErrors[v.field]) {
      fieldErrors[v.field] = translateViolation(v);
    }
  }

  return fieldErrors;
}
