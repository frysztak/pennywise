import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useMatch, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { deleteGroup, getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { handleError } from "@/lib/utils";

const userGroupsKey = createConnectQueryKey({
  schema: getUserGroups,
  cardinality: "finite",
});

interface DeletingGroup {
  groupId: string;
  groupName: string;
}

export function useDeleteGroupModal() {
  const [deletingGroup, setDeletingGroup] = useState<DeletingGroup | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentGroupMatch = useMatch({
    from: "/_pathlessLayout/group/$groupId",
    shouldThrow: false,
  });

  const { mutate: deleteGroupMutate } = useMutation(deleteGroup, {
    onSuccess: (_, variables) => {
      toast.success("Group deleted!");
      // Only navigate to dashboard if we're currently on the deleted group's page
      if (currentGroupMatch && currentGroupMatch.params.groupId === variables.groupId) {
        navigate({ to: "/dashboard" });
      }
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
    },
    onError: handleError,
  });

  const confirmDelete = (group: DeletingGroup) => {
    setDeletingGroup(group);
  };

  const handleConfirm = () => {
    if (deletingGroup) {
      deleteGroupMutate({ groupId: deletingGroup.groupId });
      setDeletingGroup(null);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setDeletingGroup(null);
    }
  };

  return {
    confirmDelete,
    dialogProps: {
      open: !!deletingGroup,
      groupName: deletingGroup?.groupName,
      onOpenChange: handleOpenChange,
      onConfirm: handleConfirm,
    },
  };
}
