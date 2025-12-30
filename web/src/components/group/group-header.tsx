import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  ChevronDownIcon,
  TrashIcon,
  Redo2Icon,
  EditIcon,
  UserRoundSearchIcon,
} from "lucide-react";

interface GroupHeaderProps {
  groupName: string;
  groupDescription?: string;
  onCreateExpense: () => void;
  onCreateTransfer: () => void;
  onInviteMembers: () => void;
  onDeleteGroup: () => void;
}

export function GroupHeader({
  groupName,
  groupDescription,
  onCreateExpense,
  onCreateTransfer,
  onInviteMembers,
  onDeleteGroup,
}: GroupHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          {groupName}
        </h1>
        <p className="text-muted-foreground mt-2">
          {groupDescription || "Manage and track shared expenses for your group."}
        </p>
      </div>
      <div className="flex gap-2">
        <ButtonGroup>
          <Button onClick={onCreateExpense}>
            <Plus />
            Add Expense
          </Button>
          <ButtonGroupSeparator />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="pl-2!">
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="[--radius:1rem]">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onCreateTransfer}>
                  <Redo2Icon />
                  Add Transfer
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
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
