import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import { GroupStats } from "@/features/group/components/stats/group-stats";
import { useGroupPageContext } from "@/features/group/hooks/use-group-page-context";
import { Spinner } from "@/shared/components/ui/spinner";

export const Route = createFileRoute("/_pathlessLayout/group/$groupId/stats")({
  component: StatsTab,
});

function StatsTab() {
  const { groupId, groupInfo } = useGroupPageContext();

  const members = groupInfo.memberBalances.map((m) => ({ userId: m.userId, userName: m.userName }));

  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Spinner className="size-8" />
        </div>
      }
    >
      <GroupStats groupId={groupId} defaultCurrency={groupInfo.groupDefaultCurrency} members={members} />
    </Suspense>
  );
}
