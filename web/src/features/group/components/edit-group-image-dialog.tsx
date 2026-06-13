import { useSuspenseQuery } from "@connectrpc/connect-query";
import { useTranslation } from "react-i18next";

import { GroupImageUpload } from "@/features/group/components/group-image-upload";
import { getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";

interface EditGroupImageDialogProps {
  open: boolean;
  groupId: string;
  onOpenChange: (open: boolean) => void;
}

export function EditGroupImageDialog({ open, groupId, onOpenChange }: EditGroupImageDialogProps) {
  const { t } = useTranslation();
  const { data: group } = useSuspenseQuery(getUserGroups, undefined, {
    select: (data) => data.groups.find((g) => g.groupId === groupId)!,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("group.photo.title")}</DialogTitle>
          <DialogDescription>{t("group.photo.description", { name: group.groupName })}</DialogDescription>
        </DialogHeader>
        <GroupImageUpload groupId={group.groupId} groupName={group.groupName} imageUpdatedAt={group.imageUpdatedAt} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} size="lg">
            {t("common.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
