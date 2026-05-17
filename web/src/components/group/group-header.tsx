import type { Timestamp } from "@bufbuild/protobuf/wkt";
import {
  ChevronDownIcon,
  EditIcon,
  ImageIcon,
  Plus,
  Redo2Icon,
  RepeatIcon,
  TrashIcon,
  UserRoundSearchIcon,
} from "lucide-react";

import { GroupImage } from "@/components/group/group-image";
import { GroupMemberStack } from "@/components/group/group-member-stack";
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
  groupId: string;
  groupName: string;
  groupDescription?: string;
  imageUpdatedAt?: Timestamp;
  members: Array<{ userId: string; userName: string }>;
  onCreateExpense: () => void;
  onCreateTransfer: () => void;
  onCreateRecurring: () => void;
  onInviteMembers: () => void;
  onEditGroup: () => void;
  onEditImage: () => void;
  onDeleteGroup: () => void;
}

export function GroupHeader({
  groupId,
  groupName,
  imageUpdatedAt,
  members,
  onCreateExpense,
  onCreateTransfer,
  onCreateRecurring,
  onInviteMembers,
  onEditGroup,
  onEditImage,
  onDeleteGroup,
}: GroupHeaderProps) {
  return (
    <div className="absolute top-0 left-0 right-0 h-80">
      {imageUpdatedAt && (
        <div className="relative h-full w-full overflow-hidden rounded-t-xl bg-muted">
          <GroupImage groupId={groupId} groupName={groupName} imageUpdatedAt={imageUpdatedAt} className="size-full" />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(8,9,13,0.15) 0%, rgba(8,9,13,0.05) 35%, rgba(8,9,13,0.7) 100%)",
            }}
          />
        </div>
      )}
      <div className="absolute top-50 left-6 right-6 flex flex-wrap flex-col gap-4 items-stretch justify-between">
        <h1 className="text-5xl font-bold font-serif tracking-tight">{groupName}</h1>
        <div className="flex flex-row justify-between gap-2">
          <GroupMemberStack members={members} className="" avatarClassName="size-9" />
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
              <DropdownMenuContent align="end" className="w-40 [--radius:1rem]">
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

                  <DropdownMenuItem onClick={onEditImage}>
                    <ImageIcon />
                    {imageUpdatedAt ? "Change photo" : "Add photo"}
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
    </div>
  );
}
