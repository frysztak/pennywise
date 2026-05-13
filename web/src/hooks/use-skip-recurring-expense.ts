import { timestampDate } from "@bufbuild/protobuf/wkt";
import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  getGroupRecurringExpenses,
  skipRecurringExpense,
} from "@/gen/api/v1/recurring_expense-RecurringExpenseService_connectquery";
import { handleError } from "@/lib/utils";

export function useSkipRecurringExpense(groupId: string) {
  const queryClient = useQueryClient();

  const recurringExpensesKey = createConnectQueryKey({
    schema: getGroupRecurringExpenses,
    cardinality: "finite",
    input: { groupId },
  });

  return useMutation(skipRecurringExpense, {
    onSuccess: (data) => {
      const nextDate = timestampDate(data.nextOccurrence!);
      toast.success(`Skipped. Next: ${nextDate.toLocaleDateString()}`);
      queryClient.invalidateQueries({ queryKey: recurringExpensesKey });
    },
    onError: handleError,
  });
}
