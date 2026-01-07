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
import MultipleSelector, { type Option } from "@/components/ui/multi-select";
import { getUsers } from "@/gen/api/v1/user-UserService_connectquery";

interface AddMemberDialogProps {
  open: boolean;
  groupId?: string;
  onOpenChange: (open: boolean) => void;
  onAddMember: (userId: string) => void;
}

export function AddMemberDialog({ open, onOpenChange, onAddMember }: AddMemberDialogProps) {
  const [selectedUsers, setSelectedUsers] = useState<Option[]>([]);

  const { data: usersData } = useQuery(getUsers, undefined, {
    enabled: open,
  });

  const userOptions = useMemo<Option[]>(() => {
    if (!usersData?.users) return [];
    return usersData.users.map((user) => ({
      value: user.id,
      label: user.username,
      email: user.email,
    }));
  }, [usersData]);

  const handleSearchSync = (query: string): Option[] => {
    if (!query || !userOptions.length) return userOptions;

    const searchQuery = query.toLowerCase();
    return userOptions.filter(
      (option) =>
        option.label.toLowerCase().includes(searchQuery) ||
        (option.email as string | undefined)?.toLowerCase().includes(searchQuery),
    );
  };

  const handleAddMembers = () => {
    selectedUsers.forEach((user) => {
      onAddMember(user.value);
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
          <MultipleSelector
            value={selectedUsers}
            onChange={setSelectedUsers}
            onSearchSync={handleSearchSync}
            placeholder="Search users by username or email..."
            emptyIndicator={<p className="text-center text-sm text-muted-foreground">No users found</p>}
            hidePlaceholderWhenSelected
          />
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
