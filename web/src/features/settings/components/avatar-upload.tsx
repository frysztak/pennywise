import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { uploadAvatar, userInfo } from "@/gen/api/v1/user-UserService_connectquery";
import { Button } from "@/shared/components/ui/button";
import { UserAvatar } from "@/shared/components/user-avatar";

const userInfoKey = createConnectQueryKey({
  schema: userInfo,
  cardinality: "finite",
});

export function AvatarUpload() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation(uploadAvatar, {
    onSuccess: () => {
      toast.success(t("settings.profile.avatarUploaded"));
      // Invalidate userInfo query to refetch with new avatar_updated_at
      queryClient.invalidateQueries({ queryKey: userInfoKey });
    },
    onError: (error) => {
      toast.error(t("settings.profile.avatarUploadFailed", { error: error.message }));
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error(t("settings.profile.avatarInvalidType"));
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t("settings.profile.avatarTooLarge"));
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
        <Button variant="outline" onClick={handleButtonClick} disabled={isPending} size="lg">
          <Upload />
          {isPending ? t("settings.profile.avatarUploading") : t("settings.profile.avatarUpload")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("settings.profile.avatarHint")}</p>
      </div>
    </div>
  );
}
