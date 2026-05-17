import { useSuspenseQuery } from "@connectrpc/connect-query";

import { GroupImageUpload } from "@/components/group/group-image-upload";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";

interface EditGroupImageDialogProps {
  open: boolean;
  groupId: string;
  onOpenChange: (open: boolean) => void;
}

export function EditGroupImageDialog({ open, groupId, onOpenChange }: EditGroupImageDialogProps) {
  const { data: group } = useSuspenseQuery(getUserGroups, undefined, {
    select: (data) => data.groups.find((g) => g.groupId === groupId)!,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Group photo</DialogTitle>
          <DialogDescription>Upload a new photo for {group.groupName}.</DialogDescription>
        </DialogHeader>
        <GroupImageUpload groupId={group.groupId} groupName={group.groupName} imageUpdatedAt={group.imageUpdatedAt} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} size="lg">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
