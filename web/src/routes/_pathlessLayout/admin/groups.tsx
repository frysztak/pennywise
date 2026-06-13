import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";

import { GroupsCard } from "@/features/admin/components/groups-card";
import i18n from "@/i18n";
import { Skeleton } from "@/shared/components/ui/skeleton";

export const Route = createFileRoute("/_pathlessLayout/admin/groups")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: i18n.t("meta.adminGroups") }],
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold font-serif tracking-tight">{t("admin.groups.title")}</h1>
      <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
        <GroupsCard />
      </Suspense>
    </div>
  );
}
