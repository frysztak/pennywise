import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { deleteExpense } from "@/gen/api/v1/expense-ExpenseService_connectquery";
import { getGroupActivity, getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import type { GetGroupActivityResponse_ActivityItem_Expense } from "@/gen/api/v1/group_pb";
import { handleError } from "@/lib/utils";

const userGroupsKey = createConnectQueryKey({
  schema: getUserGroups,
  cardinality: "finite",
});

interface DeletingExpense {
  expense: GetGroupActivityResponse_ActivityItem_Expense;
  groupId: string;
}

export function useDeleteExpenseModal(groupId: string) {
  const [deletingExpense, setDeletingExpense] = useState<DeletingExpense | null>(null);
  const queryClient = useQueryClient();

  const groupActivityKey = createConnectQueryKey({
    schema: getGroupActivity,
    cardinality: "finite",
    input: { groupId },
  });

  const { mutate: deleteExpenseMutate } = useMutation(deleteExpense, {
    onSuccess: () => {
      toast.success("Expense deleted!");
      queryClient.invalidateQueries({ queryKey: groupActivityKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
    },
    onError: handleError,
  });

  const confirmDelete = (expense: GetGroupActivityResponse_ActivityItem_Expense) => {
    setDeletingExpense({ expense, groupId });
  };

  const handleConfirm = () => {
    if (deletingExpense) {
      deleteExpenseMutate({ id: deletingExpense.expense.id });
      setDeletingExpense(null);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setDeletingExpense(null);
    }
  };

  return {
    confirmDelete,
    dialogProps: {
      open: !!deletingExpense,
      expenseName: deletingExpense?.expense.name,
      onOpenChange: handleOpenChange,
      onConfirm: handleConfirm,
    },
  };
}
