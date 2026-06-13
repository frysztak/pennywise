import { Link } from "@tanstack/react-router";
import { Activity, ChartColumn } from "lucide-react";
import { useTranslation } from "react-i18next";

interface GroupTabsProps {
  groupId: string;
}

export function GroupTabs({ groupId }: GroupTabsProps) {
  const { t } = useTranslation();
  return (
    <nav className="mb-6 flex items-center gap-1 border-b">
      <Link
        to="/group/$groupId"
        params={{ groupId }}
        activeOptions={{ exact: true }}
        className="flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors"
        activeProps={{ className: "border-primary text-foreground font-medium" }}
        inactiveProps={{ className: "border-transparent text-muted-foreground hover:text-foreground" }}
      >
        <Activity className="size-4" />
        {t("group.tabs.activity")}
      </Link>
      <Link
        to="/group/$groupId/stats"
        params={{ groupId }}
        preload="intent"
        className="flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors"
        activeProps={{ className: "border-primary text-foreground font-medium" }}
        inactiveProps={{ className: "border-transparent text-muted-foreground hover:text-foreground" }}
      >
        <ChartColumn className="size-4" />
        {t("group.tabs.stats")}
      </Link>
    </nav>
  );
}
