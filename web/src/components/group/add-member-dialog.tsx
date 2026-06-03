import { useQuery } from "@connectrpc/connect-query";
import { useMemo, useState } from "react";

import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getUsers } from "@/gen/api/v1/user-UserService_connectquery";

interface UserOption {
  value: string;
  label: string;
  email: string;
}

interface AddMemberDialogProps {
  open: boolean;
  groupId?: string;
  onOpenChange: (open: boolean) => void;
  onAddMember: (userId: string) => void;
}

export function AddMemberDialog({ open, onOpenChange, onAddMember }: AddMemberDialogProps) {
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const anchor = useComboboxAnchor();

  const { data: usersData } = useQuery(getUsers, undefined, {
    enabled: open,
  });

  const userOptions = useMemo<UserOption[]>(
    () => (usersData?.users ?? []).map((user) => ({ value: user.id, label: user.username, email: user.email })),
    [usersData],
  );
  const selectedOptions = useMemo(
    () => userOptions.filter((option) => selectedUsers.includes(option.value)),
    [userOptions, selectedUsers],
  );

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Members to Group</DialogTitle>
          <DialogDescription>Search and select users to add them to the group.</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Combobox
            multiple
            items={userOptions}
            value={selectedOptions}
            onValueChange={(options) => setSelectedUsers(options.map((option) => option.value))}
            filter={(option, query) => {
              const q = query.trim().toLowerCase();
              if (!q) return true;
              return option.label.toLowerCase().includes(q) || option.email.toLowerCase().includes(q);
            }}
          >
            <ComboboxChips ref={anchor}>
              {selectedOptions.map((option) => (
                <ComboboxChip key={option.value} aria-label={option.label}>
                  <MemberAvatar userId={option.value} username={option.label} className="size-4 rounded-full" />
                  {option.label}
                </ComboboxChip>
              ))}
              <ComboboxChipsInput placeholder="Search users by username or email..." />
            </ComboboxChips>
            <ComboboxContent anchor={anchor}>
              <ComboboxEmpty>No users found</ComboboxEmpty>
              <ComboboxList>
                {(option: UserOption) => (
                  <ComboboxItem key={option.value} value={option}>
                    <MemberAvatar userId={option.value} username={option.label} className="size-7 rounded-full" />
                    <div className="flex flex-col">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.email}</span>
                    </div>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} size="lg">
            Cancel
          </Button>
          <Button onClick={handleAddMembers} disabled={selectedUsers.length === 0} size="lg">
            Add {selectedUsers.length > 0 && `(${selectedUsers.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
