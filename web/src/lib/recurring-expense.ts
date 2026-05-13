import { RecurringFrequency } from "@/gen/api/v1/recurring_expense_pb";

export function frequencyToString(freq: RecurringFrequency): string {
  switch (freq) {
    case RecurringFrequency.DAILY:
      return "Daily";
    case RecurringFrequency.WEEKLY:
      return "Weekly";
    case RecurringFrequency.MONTHLY:
      return "Monthly";
    case RecurringFrequency.YEARLY:
      return "Yearly";
    default:
      return "Monthly";
  }
}
