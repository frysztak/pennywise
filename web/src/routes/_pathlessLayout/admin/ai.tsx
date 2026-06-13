import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";

import { ReceiptPromptCard } from "@/features/admin/components/receipt-prompt-card";
import { Skeleton } from "@/shared/components/ui/skeleton";

export const Route = createFileRoute("/_pathlessLayout/admin/ai")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Admin | AI" }],
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold font-serif tracking-tight">{t("admin.nav.ai")}</h1>
      <Suspense fallback={<Skeleton className="h-48 w-full max-w-xl rounded-xl" />}>
        <ReceiptPromptCard />
      </Suspense>
    </div>
  );
}
