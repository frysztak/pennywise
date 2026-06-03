import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import { ReceiptPromptCard } from "@/components/admin/receipt-prompt-card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_pathlessLayout/admin/ai")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold font-serif tracking-tight">AI</h1>
      <Suspense fallback={<Skeleton className="h-48 w-full max-w-xl rounded-xl" />}>
        <ReceiptPromptCard />
      </Suspense>
    </div>
  );
}
