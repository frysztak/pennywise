import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import {
  deleteRecurringExpense,
  getGroupRecurringExpenses,
} from "@/gen/api/v1/recurring_expense-RecurringExpenseService_connectquery";
import { handleError } from "@/lib/utils";

export function useDeleteRecurringExpenseModal(groupId: string) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const recurringExpensesKey = createConnectQueryKey({
    schema: getGroupRecurringExpenses,
    cardinality: "finite",
    input: { groupId },
  });

  const { mutate: deleteRecurringExpenseMutate } = useMutation(deleteRecurringExpense, {
    onSuccess: () => {
      toast.success("Recurring expense deleted!");
      queryClient.invalidateQueries({ queryKey: recurringExpensesKey });
    },
    onError: handleError,
  });

  const confirmDelete = (id: string) => {
    setDeletingId(id);
  };

  const handleConfirm = () => {
    if (deletingId) {
      deleteRecurringExpenseMutate({ id: deletingId });
      setDeletingId(null);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setDeletingId(null);
    }
  };

  return {
    confirmDelete,
    dialogProps: {
      open: !!deletingId,
      onOpenChange: handleOpenChange,
      onConfirm: handleConfirm,
    },
  };
}
