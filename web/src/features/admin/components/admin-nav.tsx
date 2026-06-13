import { Coins, FolderKanban, Sparkles, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SectionNav } from "@/shared/components/section-nav";

const items = [
  { to: "/admin/members", labelKey: "admin.nav.members", icon: Users },
  { to: "/admin/groups", labelKey: "admin.nav.groups", icon: FolderKanban },
  { to: "/admin/currencies", labelKey: "admin.nav.currencies", icon: Coins },
  { to: "/admin/ai", labelKey: "admin.nav.ai", icon: Sparkles },
] as const;

export function AdminNav() {
  const { t } = useTranslation();
  return (
    <SectionNav
      title={t("admin.title")}
      items={items.map(({ to, labelKey, icon }) => ({ to, label: t(labelKey), icon }))}
    />
  );
}
