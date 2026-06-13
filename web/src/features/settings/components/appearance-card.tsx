import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/shared/components/theme-provider";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";

export function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  return (
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
  );
}
