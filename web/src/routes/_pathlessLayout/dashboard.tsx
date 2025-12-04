import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@connectrpc/connect-query';
import { getUserGroups, getGroupBalance } from '@/gen/api/v1/group-GroupService_connectquery';
import { ExpenseGroupCard } from '@/components/expense-group-card';

export const Route = createFileRoute('/_pathlessLayout/dashboard')({
  component: RouteComponent,
});

function RouteComponent() {
  const { data: groupsData } = useSuspenseQuery(getUserGroups);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Overview of your expense groups and balances
        </p>
      </div>

      {groupsData.groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground mb-4">
            You don't have any expense groups yet.
          </p>
          <p className="text-sm text-muted-foreground">
            Create a group to start tracking shared expenses.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupsData.groups.map((group) => (
            <Link
              key={group.groupId}
              to="/group/$groupId"
              params={{ groupId: group.groupId }}
              className="group"
            >
              <GroupCardWithBalance
                groupId={group.groupId}
                groupName={group.groupName}
                groupDescription={group.groupDescription}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupCardWithBalance({
  groupId,
  groupName,
  groupDescription,
}: {
  groupId: string;
  groupName: string;
  groupDescription: string;
}) {
  const { data: balanceData } = useSuspenseQuery(getGroupBalance, {
    groupId,
  });

  return (
    <ExpenseGroupCard
      groupName={groupName}
      groupDescription={groupDescription}
      balance={balanceData.balance}
    />
  );
}
