import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { deleteExpense } from "@/gen/api/v1/expense-ExpenseService_connectquery";
import { getGroupActivity, getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { deleteTransfer } from "@/gen/api/v1/transfer-TransferService_connectquery";
import { handleError } from "@/lib/utils";

const userGroupsKey = createConnectQueryKey({
  schema: getUserGroups,
  cardinality: "finite",
});

export function useGroupMutations(groupId: string) {
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

  const { mutate: deleteTransferMutate } = useMutation(deleteTransfer, {
    onSuccess: () => {
      toast.success("Transfer deleted!");
      queryClient.invalidateQueries({ queryKey: groupActivityKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
    },
    onError: handleError,
  });

  return {
    deleteExpense: deleteExpenseMutate,
    deleteTransfer: deleteTransferMutate,
  };
}
