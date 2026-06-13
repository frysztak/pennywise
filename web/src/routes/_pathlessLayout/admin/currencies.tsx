import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";

import { CurrenciesCard } from "@/features/admin/components/currencies-card";
import { Skeleton } from "@/shared/components/ui/skeleton";

export const Route = createFileRoute("/_pathlessLayout/admin/currencies")({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold font-serif tracking-tight">{t("admin.nav.currencies")}</h1>
      <Suspense fallback={<Skeleton className="h-48 w-full max-w-xl rounded-xl" />}>
        <CurrenciesCard />
      </Suspense>
    </div>
  );
}
