import { useSuspenseQuery } from "@connectrpc/connect-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { ExpenseGroupCard } from "@/components/expense-group-card";
import { getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";

export const Route = createFileRoute("/_pathlessLayout/dashboard")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Dashboard" }],
  }),
});

function RouteComponent() {
  const { data: groupsData } = useSuspenseQuery(getUserGroups);

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Overview of your expense groups and balances</p>
      </div>

      {groupsData.groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground mb-4">You don't have any expense groups yet.</p>
          <p className="text-sm text-muted-foreground">Create a group to start tracking shared expenses.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groupsData.groups.map((group) => {
            // Find current user's balance from member balances
            const currentUserBalance = group.memberBalances.find((mb) => mb.userId === group.userId);

            return (
              <Link key={group.groupId} to="/group/$groupId" params={{ groupId: group.groupId }} className="group">
                <ExpenseGroupCard
                  groupId={group.groupId}
                  groupName={group.groupName}
                  groupDefaultCurrency={group.groupDefaultCurrency}
                  balance={currentUserBalance?.balance || {}}
                  imageUpdatedAt={group.imageUpdatedAt}
                  members={group.memberBalances.map((m) => ({ userId: m.userId, userName: m.userName }))}
                />
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
