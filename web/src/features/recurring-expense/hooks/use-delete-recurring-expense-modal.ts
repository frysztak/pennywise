import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  deleteRecurringExpense,
  getGroupRecurringExpenses,
} from "@/gen/api/v1/recurring_expense-RecurringExpenseService_connectquery";
import { handleError } from "@/shared/lib/utils";

export function useDeleteRecurringExpenseModal(groupId: string) {
  const { t } = useTranslation();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const recurringExpensesKey = createConnectQueryKey({
    schema: getGroupRecurringExpenses,
    cardinality: "finite",
    input: { groupId },
  });

  const { mutate: deleteRecurringExpenseMutate } = useMutation(deleteRecurringExpense, {
    onSuccess: () => {
      toast.success(t("recurringExpense.deleted"));
      queryClient.invalidateQueries({ queryKey: recurringExpensesKey });
    },
    onError: handleError,
  });

  const confirmDelete = (id: string) => {
    setDeletingId(id);
  };

  const handleConfirm = () => {
    if (deletingId) {
      deleteRecurringExpenseMutate({ id: deletingId, groupId });
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
