import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { addUserToGroup, getGroupActivity, getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { handleError } from "@/lib/utils";

const userGroupsKey = createConnectQueryKey({
  schema: getUserGroups,
  cardinality: "finite",
});

interface AddingMember {
  groupId: string;
}

export function useAddMemberModal() {
  const [addingMember, setAddingMember] = useState<AddingMember | null>(null);
  const queryClient = useQueryClient();

  const { mutate: addMemberMutate } = useMutation(addUserToGroup, {
    onSuccess: (_, variables) => {
      toast.success("Member added to group!");
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: getGroupActivity,
          cardinality: "finite",
          input: { groupId: variables.groupId },
        }),
      });
    },
    onError: handleError,
  });

  const openModal = (groupId: string) => {
    setAddingMember({ groupId });
  };

  const handleAddMember = (userId: string) => {
    if (addingMember) {
      addMemberMutate({ userId, groupId: addingMember.groupId });
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setAddingMember(null);
    }
  };

  return {
    openModal,
    dialogProps: {
      open: !!addingMember,
      groupId: addingMember?.groupId,
      onOpenChange: handleOpenChange,
      onAddMember: handleAddMember,
    },
  };
}
