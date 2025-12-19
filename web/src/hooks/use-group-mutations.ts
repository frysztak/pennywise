import { useMutation, createConnectQueryKey } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGroupExpenses,
  deleteExpense,
} from "@/gen/api/v1/expense-ExpenseService_connectquery";
import {
  getGroupTransfers,
  deleteTransfer,
} from "@/gen/api/v1/transfer-TransferService_connectquery";
import { getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { handleError } from "@/lib/utils";
import { toast } from "sonner";

const userGroupsKey = createConnectQueryKey({
  schema: getUserGroups,
  cardinality: "finite",
});

export function useGroupMutations(groupId: string) {
  const queryClient = useQueryClient();

  const groupExpensesKey = createConnectQueryKey({
    schema: getGroupExpenses,
    cardinality: "finite",
    input: { groupId },
  });

  const groupTransfersKey = createConnectQueryKey({
    schema: getGroupTransfers,
    cardinality: "finite",
    input: { groupId },
  });

  const { mutate: deleteExpenseMutate } = useMutation(deleteExpense, {
    onSuccess: () => {
      toast.success("Expense deleted!");
      queryClient.invalidateQueries({ queryKey: groupExpensesKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
    },
    onError: handleError,
  });

  const { mutate: deleteTransferMutate } = useMutation(deleteTransfer, {
    onSuccess: () => {
      toast.success("Transfer deleted!");
      queryClient.invalidateQueries({ queryKey: groupTransfersKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
    },
    onError: handleError,
  });

  return {
    deleteExpense: deleteExpenseMutate,
    deleteTransfer: deleteTransferMutate,
  };
}
