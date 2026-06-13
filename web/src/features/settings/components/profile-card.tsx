import { useTranslation } from "react-i18next";

import { AvatarUpload } from "@/features/settings/components/avatar-upload";
import { UsernameEdit } from "@/features/settings/components/username-edit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";

export function ProfileCard() {
  const { t } = useTranslation();
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{t("settings.profile.title")}</CardTitle>
        <CardDescription>{t("settings.profile.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">{t("settings.profile.username")}</label>
            <div className="mt-2">
              <UsernameEdit />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">{t("settings.profile.avatar")}</label>
            <div className="mt-2">
              <AvatarUpload />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
