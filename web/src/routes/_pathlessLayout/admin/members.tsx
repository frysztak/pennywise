import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import { UsersCard } from "@/features/admin/components/users-card";
import { Skeleton } from "@/shared/components/ui/skeleton";

export const Route = createFileRoute("/_pathlessLayout/admin/members")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Admin | Members" }],
  }),
});

function RouteComponent() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold font-serif tracking-tight">Members</h1>
      <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
        <UsersCard />
      </Suspense>
    </div>
  );
}
