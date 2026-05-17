import type { Timestamp } from "@bufbuild/protobuf/wkt";
import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

import { GroupImage } from "@/components/group/group-image";
import { Button } from "@/components/ui/button";
import { deleteGroupImage, getUserGroups, uploadGroupImage } from "@/gen/api/v1/group-GroupService_connectquery";

const userGroupsKey = createConnectQueryKey({
  schema: getUserGroups,
  cardinality: "finite",
});

interface GroupImageUploadProps {
  groupId: string;
  groupName: string;
  imageUpdatedAt?: Timestamp;
}

export function GroupImageUpload({ groupId, groupName, imageUpdatedAt }: GroupImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const upload = useMutation(uploadGroupImage, {
    onSuccess: () => {
      toast.success("Group photo updated");
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
    },
    onError: (error) => {
      toast.error(`Failed to upload photo: ${error.message}`);
    },
  });

  const remove = useMutation(deleteGroupImage, {
    onSuccess: () => {
      toast.success("Group photo removed");
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
    },
    onError: (error) => {
      toast.error(`Failed to remove photo: ${error.message}`);
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Cap raw upload at 16MB — server re-encodes to JPEG ~1600×1067.
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Image must be smaller than 16MB");
      return;
    }

    const arrayBuffer = await file.arrayBuffer();
    upload.mutate({
      groupId,
      imageData: new Uint8Array(arrayBuffer),
      mimeType: file.type,
    });
  };

  const isPending = upload.isPending || remove.isPending;

  return (
    <div className="space-y-3">
      <div className="bg-muted aspect-[3/2] w-full overflow-hidden rounded-lg border">
        <GroupImage groupId={groupId} groupName={groupName} imageUpdatedAt={imageUpdatedAt} className="size-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          className="hidden"
        />
        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isPending}>
          <Upload />
          {imageUpdatedAt ? "Replace photo" : "Upload photo"}
        </Button>
        {imageUpdatedAt && (
          <Button type="button" variant="ghost" onClick={() => remove.mutate({ groupId })} disabled={isPending}>
            <Trash2 />
            Remove
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">JPG, PNG, or WebP. Resized to 1600×1067 on the server.</p>
    </div>
  );
}
