import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

export interface SectionNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface SectionNavProps {
  title: string;
  items: SectionNavItem[];
}

export function SectionNav({ title, items }: SectionNavProps) {
  return (
    <nav className="flex flex-col gap-1">
      <p className="px-3 py-2 text-xs font-medium text-muted-foreground">{title}</p>
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
