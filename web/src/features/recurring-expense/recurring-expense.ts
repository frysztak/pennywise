import { RecurringFrequency } from "@/gen/api/v1/recurring_expense_pb";

type FrequencyKey =
  | "recurringExpense.frequencies.daily"
  | "recurringExpense.frequencies.weekly"
  | "recurringExpense.frequencies.monthly"
  | "recurringExpense.frequencies.yearly";

// Returns the translation key for a frequency. Callers pass the result to t().
export function frequencyToKey(freq: RecurringFrequency): FrequencyKey {
  switch (freq) {
    case RecurringFrequency.DAILY:
      return "recurringExpense.frequencies.daily";
    case RecurringFrequency.WEEKLY:
      return "recurringExpense.frequencies.weekly";
    case RecurringFrequency.MONTHLY:
      return "recurringExpense.frequencies.monthly";
    case RecurringFrequency.YEARLY:
      return "recurringExpense.frequencies.yearly";
    default:
      return "recurringExpense.frequencies.monthly";
  }
}
