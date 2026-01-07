import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import {
  getGroupActivity,
  getUserGroups,
  updateGroup,
  updateUserWeight,
} from "@/gen/api/v1/group-GroupService_connectquery";
import { handleError } from "@/lib/utils";

const userGroupsKey = createConnectQueryKey({
  schema: getUserGroups,
  cardinality: "finite",
});

export interface EditingGroup {
  groupId: string;
  groupName: string;
  groupDescription: string;
  defaultCurrency: string;
}

export function useEditGroupModal() {
  const [editingGroup, setEditingGroup] = useState<EditingGroup | null>(null);
  const queryClient = useQueryClient();

  const { mutate: updateGroupMutate } = useMutation(updateGroup, {
    onSuccess: (_, variables) => {
      toast.success("Group updated!");
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: getGroupActivity,
          cardinality: "finite",
          input: { groupId: variables.id },
        }),
      });
    },
    onError: handleError,
  });

  const { mutate: updateWeightMutate } = useMutation(updateUserWeight, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
    },
    onError: handleError,
  });

  const openModal = (group: EditingGroup) => {
    setEditingGroup(group);
  };

  const handleUpdateGroup = (data: { name: string; description: string; defaultCurrency: string }) => {
    if (editingGroup) {
      updateGroupMutate({
        id: editingGroup.groupId,
        name: data.name,
        description: data.description,
        defaultCurrency: data.defaultCurrency,
      });
    }
  };

  const handleUpdateWeight = (userId: string, weight: number) => {
    if (editingGroup) {
      updateWeightMutate({
        userId,
        groupId: editingGroup.groupId,
        weight,
      });
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setEditingGroup(null);
    }
  };

  return {
    openModal,
    dialogProps: {
      open: !!editingGroup,
      group: editingGroup,
      onOpenChange: handleOpenChange,
      onUpdateGroup: handleUpdateGroup,
      onUpdateWeight: handleUpdateWeight,
    },
  };
}
