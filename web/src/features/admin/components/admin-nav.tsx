import { Link } from "@tanstack/react-router";
import { Coins, FolderKanban, Sparkles, Users } from "lucide-react";

const items = [
  { to: "/admin/members", label: "Members", icon: Users },
  { to: "/admin/groups", label: "Groups", icon: FolderKanban },
  { to: "/admin/currencies", label: "Currencies", icon: Coins },
  { to: "/admin/ai", label: "AI", icon: Sparkles },
] as const;

export function AdminNav() {
  return (
    <nav className="flex flex-col gap-1">
      <p className="px-3 py-2 text-xs font-medium text-muted-foreground">Admin</p>
      {items.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
          activeProps={{ className: "bg-muted text-foreground font-medium" }}
          inactiveProps={{ className: "text-muted-foreground hover:bg-muted hover:text-foreground" }}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
