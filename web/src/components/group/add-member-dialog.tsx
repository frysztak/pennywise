import { useQuery } from "@connectrpc/connect-query";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectItem,
  MultiSelectTrigger,
  MultiSelectValue,
} from "@/components/ui/multi-select";
import { getUsers } from "@/gen/api/v1/user-UserService_connectquery";

interface AddMemberDialogProps {
  open: boolean;
  groupId?: string;
  onOpenChange: (open: boolean) => void;
  onAddMember: (userId: string) => void;
}

export function AddMemberDialog({ open, onOpenChange, onAddMember }: AddMemberDialogProps) {
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const { data: usersData } = useQuery(getUsers, undefined, {
    enabled: open,
  });

  const users = useMemo(() => usersData?.users ?? [], [usersData]);

  const handleAddMembers = () => {
    selectedUsers.forEach((userId) => {
      onAddMember(userId);
    });
    setSelectedUsers([]);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setSelectedUsers([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Members to Group</DialogTitle>
          <DialogDescription>Search and select users to add them to the group.</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <MultiSelect values={selectedUsers} onValuesChange={setSelectedUsers}>
            <MultiSelectTrigger className="w-full">
              <MultiSelectValue placeholder="Search users by username or email..." />
            </MultiSelectTrigger>
            <MultiSelectContent
              search={{
                placeholder: "Search users by username or email...",
                emptyMessage: "No users found",
              }}
            >
              {users.map((user) => (
                <MultiSelectItem
                  key={user.id}
                  value={user.id}
                  badgeLabel={user.username}
                  keywords={[user.username, user.email]}
                >
                  <div className="flex flex-col">
                    <span>{user.username}</span>
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  </div>
                </MultiSelectItem>
              ))}
            </MultiSelectContent>
          </MultiSelect>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleAddMembers} disabled={selectedUsers.length === 0}>
            Add {selectedUsers.length > 0 && `(${selectedUsers.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
