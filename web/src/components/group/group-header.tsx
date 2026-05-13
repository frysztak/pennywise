import { ChevronDownIcon, EditIcon, Plus, Redo2Icon, RepeatIcon, TrashIcon, UserRoundSearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface GroupHeaderProps {
  groupName: string;
  groupDescription?: string;
  onCreateExpense: () => void;
  onCreateTransfer: () => void;
  onCreateRecurring: () => void;
  onInviteMembers: () => void;
  onEditGroup: () => void;
  onDeleteGroup: () => void;
}

export function GroupHeader({
  groupName,
  groupDescription,
  onCreateExpense,
  onCreateTransfer,
  onCreateRecurring,
  onInviteMembers,
  onEditGroup,
  onDeleteGroup,
}: GroupHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{groupName}</h1>
        <p className="text-muted-foreground mt-2">
          {groupDescription || "Manage and track shared expenses for your group."}
        </p>
      </div>
      <div className="flex gap-2">
        <ButtonGroup>
          <Button onClick={onCreateExpense} size="lg" className="h-10">
            <Plus />
            Add Expense
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button className="h-10" size="icon-lg">
                  <ChevronDownIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-36 [--radius:1rem]">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onCreateTransfer}>
                  <Redo2Icon />
                  Add Transfer
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onCreateRecurring}>
                  <RepeatIcon />
                  Add Recurring
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onEditGroup}>
                  <EditIcon />
                  Edit Group
                </DropdownMenuItem>

                <DropdownMenuItem onClick={onInviteMembers}>
                  <UserRoundSearchIcon />
                  Invite Members
                </DropdownMenuItem>

                <DropdownMenuItem variant="destructive" onClick={onDeleteGroup}>
                  <TrashIcon />
                  Delete Group
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      </div>
    </div>
  );
}
