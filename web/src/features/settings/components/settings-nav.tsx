import { Languages, Palette, User } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SectionNav } from "@/shared/components/section-nav";

const items = [
  { to: "/settings/profile", labelKey: "settings.nav.profile", icon: User },
  { to: "/settings/appearance", labelKey: "settings.nav.appearance", icon: Palette },
  { to: "/settings/language", labelKey: "settings.nav.language", icon: Languages },
] as const;

export function SettingsNav() {
  const { t } = useTranslation();
  return (
    <SectionNav
      title={t("settings.title")}
      items={items.map(({ to, labelKey, icon }) => ({ to, label: t(labelKey), icon }))}
    />
  );
}
