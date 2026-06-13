import { Link } from "@tanstack/react-router";
import { Coins, FolderKanban, Sparkles, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

const items = [
  { to: "/admin/members", labelKey: "admin.nav.members", icon: Users },
  { to: "/admin/groups", labelKey: "admin.nav.groups", icon: FolderKanban },
  { to: "/admin/currencies", labelKey: "admin.nav.currencies", icon: Coins },
  { to: "/admin/ai", labelKey: "admin.nav.ai", icon: Sparkles },
] as const;

export function AdminNav() {
  const { t } = useTranslation();
  return (
    <nav className="flex flex-col gap-1">
      <p className="px-3 py-2 text-xs font-medium text-muted-foreground">{t("admin.title")}</p>
      {items.map(({ to, labelKey, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
          activeProps={{ className: "bg-muted text-foreground font-medium" }}
          inactiveProps={{ className: "text-muted-foreground hover:bg-muted hover:text-foreground" }}
        >
          <Icon className="size-4" />
          {t(labelKey)}
        </Link>
      ))}
    </nav>
  );
}
