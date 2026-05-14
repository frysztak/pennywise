import { Check } from "lucide-react";

import { Card } from "@/components/ui/card";

interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <Card className="flex flex-row items-center gap-5 px-7 py-8">
      <div className="grid size-13 flex-none place-items-center rounded-full border border-primary/20 bg-primary/15 text-primary">
        <Check size={22} strokeWidth={1.75} />
      </div>
      <div>
        <div className="mb-0.5 text-base font-semibold">{title}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
    </Card>
  );
}
