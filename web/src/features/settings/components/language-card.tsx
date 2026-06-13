import { useTranslation } from "react-i18next";

import { LanguageSelector } from "@/features/settings/components/language-selector";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";

export function LanguageCard() {
  const { t } = useTranslation();
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{t("settings.language.title")}</CardTitle>
        <CardDescription>{t("settings.language.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <LanguageSelector />
      </CardContent>
    </Card>
  );
}
