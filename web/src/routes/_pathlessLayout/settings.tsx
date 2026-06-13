import { createFileRoute } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AvatarUpload } from "@/features/settings/components/avatar-upload";
import { LanguageSelector } from "@/features/settings/components/language-selector";
import { UsernameEdit } from "@/features/settings/components/username-edit";
import { useTheme } from "@/shared/components/theme-provider";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";

export const Route = createFileRoute("/_pathlessLayout/settings")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Settings" }],
  }),
});

function RouteComponent() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h1 className="text-5xl font-bold font-serif tracking-tight">{t("settings.title")}</h1>

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

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{t("settings.appearance.title")}</CardTitle>
          <CardDescription>{t("settings.appearance.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("settings.appearance.theme")}</label>
            <div className="flex flex-col md:flex-row gap-2">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                onClick={() => setTheme("light")}
                size="lg"
                className="md:flex-1"
              >
                <Sun />
                {t("settings.appearance.light")}
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                onClick={() => setTheme("dark")}
                size="lg"
                className="md:flex-1"
              >
                <Moon />
                {t("settings.appearance.dark")}
              </Button>
              <Button
                variant={theme === "system" ? "default" : "outline"}
                onClick={() => setTheme("system")}
                size="lg"
                className="md:flex-1"
              >
                <Monitor />
                {t("settings.appearance.auto")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.appearance.autoHint")}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{t("settings.language.title")}</CardTitle>
          <CardDescription>{t("settings.language.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LanguageSelector />
        </CardContent>
      </Card>
    </div>
  );
}
