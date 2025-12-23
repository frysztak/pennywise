import { useState } from "react";
import { useMutation, createConnectQueryKey } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { deleteTransfer } from "@/gen/api/v1/transfer-TransferService_connectquery";
import {
  getGroupActivity,
  getUserGroups,
} from "@/gen/api/v1/group-GroupService_connectquery";
import { handleError } from "@/lib/utils";
import { toast } from "sonner";
import type { GetGroupActivityResponse_ActivityItem_Transfer } from "@/gen/api/v1/group_pb";

const userGroupsKey = createConnectQueryKey({
  schema: getUserGroups,
  cardinality: "finite",
});

interface DeletingTransfer {
  transfer: GetGroupActivityResponse_ActivityItem_Transfer;
  groupId: string;
}

export function useDeleteTransferModal(groupId: string) {
  const [deletingTransfer, setDeletingTransfer] = useState<DeletingTransfer | null>(null);
  const queryClient = useQueryClient();

  const groupActivityKey = createConnectQueryKey({
    schema: getGroupActivity,
    cardinality: "finite",
    input: { groupId },
  });

  const { mutate: deleteTransferMutate } = useMutation(deleteTransfer, {
    onSuccess: () => {
      toast.success("Transfer deleted!");
      queryClient.invalidateQueries({ queryKey: groupActivityKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
    },
    onError: handleError,
  });

  const confirmDelete = (transfer: GetGroupActivityResponse_ActivityItem_Transfer) => {
    setDeletingTransfer({ transfer, groupId });
  };

  const handleConfirm = () => {
    if (deletingTransfer) {
      deleteTransferMutate({ id: deletingTransfer.transfer.id });
      setDeletingTransfer(null);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setDeletingTransfer(null);
    }
  };

  return {
    confirmDelete,
    dialogProps: {
      open: !!deletingTransfer,
      senderName: deletingTransfer?.transfer.senderName,
      receiverName: deletingTransfer?.transfer.receiverName,
      onOpenChange: handleOpenChange,
      onConfirm: handleConfirm,
    },
  };
}
