import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { uploadAvatar, userInfo } from "@/gen/api/v1/user-UserService_connectquery";

const userInfoKey = createConnectQueryKey({
  schema: userInfo,
  cardinality: "finite",
});

export function AvatarUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation(uploadAvatar, {
    onSuccess: () => {
      toast.success("Avatar uploaded successfully");
      // Invalidate userInfo query to refetch with new avatar_updated_at
      queryClient.invalidateQueries({ queryKey: userInfoKey });
    },
    onError: (error) => {
      toast.error(`Failed to upload avatar: ${error.message}`);
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be smaller than 2MB");
      return;
    }

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    mutate({
      avatarData: bytes,
      mimeType: file.type,
    });
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex items-center gap-4">
      <UserAvatar className="h-20 w-20" />
      <div className="flex flex-col gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
        <Button variant="outline" onClick={handleButtonClick} disabled={isPending}>
          <Upload />
          {isPending ? "Uploading..." : "Upload Avatar"}
        </Button>
        <p className="text-xs text-muted-foreground">JPG, PNG or GIF. Max 2MB.</p>
      </div>
    </div>
  );
}
