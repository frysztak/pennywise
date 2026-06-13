import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useAuth } from "@/features/auth/auth";
import { updateUser, userInfo } from "@/gen/api/v1/user-UserService_connectquery";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";

const userInfoKey = createConnectQueryKey({
  schema: userInfo,
  cardinality: "finite",
});

export function UsernameEdit() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState(user?.username ?? "");

  const { mutate: updateUsername, isPending } = useMutation(updateUser, {
    onSuccess: () => {
      toast.success(t("settings.profile.usernameUpdated"));
      queryClient.invalidateQueries({ queryKey: userInfoKey });
    },
    onError: (error) => {
      toast.error(t("settings.profile.usernameUpdateFailed", { error: error.message }));
    },
  });

  const handleSave = () => {
    if (username.length < 3) {
      toast.error(t("settings.profile.usernameMin"));
      return;
    }
    updateUsername({ username });
  };

  return (
    <div className="flex gap-2">
      <Input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder={t("settings.profile.usernamePlaceholder")}
      />
      <Button onClick={handleSave} disabled={isPending || username === user?.username} size="lg">
        {isPending ? t("common.saving") : t("common.save")}
      </Button>
    </div>
  );
}
