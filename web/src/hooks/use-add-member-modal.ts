import { useState } from "react";
import { useMutation, createConnectQueryKey } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { addUserToGroup, getUserGroups, getGroupActivity } from "@/gen/api/v1/group-GroupService_connectquery";
import { handleError } from "@/lib/utils";
import { toast } from "sonner";

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
