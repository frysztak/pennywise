import type { Timestamp } from "@bufbuild/protobuf/wkt";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronDownIcon,
  EditIcon,
  ImageIcon,
  Plus,
  Redo2Icon,
  RepeatIcon,
  Star,
  StarOff,
  TrashIcon,
  UserRoundSearchIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { GroupImage } from "@/features/group/components/group-image";
import { GroupMemberStack } from "@/features/group/components/group-member-stack";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { ButtonGroup } from "@/shared/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

interface GroupHeaderProps {
  groupId: string;
  groupName: string;
  groupDescription?: string;
  imageUpdatedAt?: Timestamp;
  members: Array<{ userId: string; userName: string }>;
  isPinned: boolean;
  isArchived: boolean;
  onCreateExpense: () => void;
  onCreateTransfer: () => void;
  onCreateRecurring: () => void;
  onInviteMembers: () => void;
  onEditGroup: () => void;
  onEditImage: () => void;
  onDeleteGroup: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
}

export function GroupHeader({
  groupId,
  groupName,
  imageUpdatedAt,
  members,
  isPinned,
  isArchived,
  onCreateExpense,
  onCreateTransfer,
  onCreateRecurring,
  onInviteMembers,
  onEditGroup,
  onEditImage,
  onDeleteGroup,
  onTogglePin,
  onToggleArchive,
}: GroupHeaderProps) {
  const { t } = useTranslation();
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
        <div className="flex flex-row flex-wrap items-center gap-3">
          <h1 className="text-5xl font-bold font-serif tracking-tight text-(--cream-50)">{groupName}</h1>
          {isArchived && <Badge variant="secondary">{t("common.archived")}</Badge>}
        </div>
        <div className="flex flex-row justify-between gap-2">
          <GroupMemberStack members={members} className="" avatarClassName="size-9" />
          <ButtonGroup>
            <Button onClick={onCreateExpense} size="lg" className="h-10" disabled={isArchived}>
              <Plus />
              {t("group.header.addExpense")}
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
                {!isArchived && (
                  <>
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={onCreateTransfer}>
                        <Redo2Icon />
                        {t("group.header.addTransfer")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={onCreateRecurring}>
                        <RepeatIcon />
                        {t("group.header.addRecurring")}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={onEditGroup}>
                        <EditIcon />
                        {t("group.edit.title")}
                      </DropdownMenuItem>

                      <DropdownMenuItem onClick={onEditImage}>
                        <ImageIcon />
                        {imageUpdatedAt ? t("group.photo.change") : t("group.photo.add")}
                      </DropdownMenuItem>

                      <DropdownMenuItem onClick={onInviteMembers}>
                        <UserRoundSearchIcon />
                        {t("group.header.inviteMembers")}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuGroup>
                  {!isArchived && (
                    <DropdownMenuItem onClick={onTogglePin}>
                      {isPinned ? <StarOff /> : <Star />}
                      {isPinned ? t("group.unpin") : t("group.pin")}
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuItem onClick={onToggleArchive}>
                    {isArchived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                    {isArchived ? t("group.header.unarchive") : t("group.header.archive")}
                  </DropdownMenuItem>

                  <DropdownMenuItem variant="destructive" onClick={onDeleteGroup}>
                    <TrashIcon />
                    {t("group.delete")}
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
