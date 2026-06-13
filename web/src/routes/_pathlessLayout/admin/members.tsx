import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";

import { UsersCard } from "@/features/admin/components/users-card";
import { Skeleton } from "@/shared/components/ui/skeleton";

export const Route = createFileRoute("/_pathlessLayout/admin/members")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Admin | Members" }],
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold font-serif tracking-tight">{t("admin.nav.members")}</h1>
      <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
        <UsersCard />
      </Suspense>
    </div>
  );
}
