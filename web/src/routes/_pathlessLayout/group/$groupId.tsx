import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@connectrpc/connect-query";
import { getGroupExpenses } from "@/gen/api/v1/expense-ExpenseService_connectquery";
import { getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { userInfo } from "@/gen/api/v1/user-UserService_connectquery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AmountWithCurrency } from "@/components/amount-with-currency";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_pathlessLayout/group/$groupId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { groupId } = Route.useParams();
  const { data: expensesData } = useSuspenseQuery(getGroupExpenses, {
    groupId,
  });
  const { data: groupInfo } = useSuspenseQuery(getUserGroups, undefined, {
    select: (data) => data.groups.find((g) => g.groupId === groupId),
  });
  const { data: currentUser } = useSuspenseQuery(userInfo);

  // Find current user's balance from member balances
  const currentUserBalance = groupInfo?.memberBalances.find(
    (mb) => mb.userId === currentUser.id
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            {groupInfo?.groupName || "Group"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {groupInfo?.groupDescription ||
              "Manage and track shared expenses for your group."}
          </p>
        </div>

        {/* Balance Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="">
            <CardHeader>
              <CardTitle className="text-lg">Your total balance</CardTitle>
            </CardHeader>
            <CardContent>
              <AmountWithCurrency
                balance={currentUserBalance?.balance || {}}
                defaultCurrency={groupInfo?.groupDefaultCurrency}
                className="text-2xl"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Total group spending</CardTitle>
            </CardHeader>
            <CardContent>
              <AmountWithCurrency
                balance={groupInfo?.totalSpending || {}}
                defaultCurrency={groupInfo?.groupDefaultCurrency}
                disableColor
                className="text-2xl"
              />
            </CardContent>
          </Card>
        </div>

        {/* Group Balances */}
        <div>
          <h2 className="text-xl font-bold mb-4">Group Balances</h2>
          <div className="space-y-3">
            {groupInfo?.memberBalances
              .filter((member) => member.userId !== currentUser.id)
              .map((member) => (
                <Card key={member.userId} className="py-0">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <span className="text-sm font-medium">
                            {member.userName
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </span>
                        </div>
                        <span className="font-medium">{member.userName}</span>
                      </div>
                      <AmountWithCurrency
                        balance={member.balance}
                        defaultCurrency={groupInfo?.groupDefaultCurrency}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
          {expensesData.expenses.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">
                  No expenses yet in this group.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Expense</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Paid by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expensesData.expenses.map((expense) => {
                  const date = new Date(expense.createdAt);
                  const formattedDate = date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <TableRow key={expense.id}>
                      <TableCell className="text-sm">{formattedDate}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{expense.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <AmountWithCurrency
                          disableColor
                          className="text-right"
                          balance={[expense]}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                            <span className="text-xs">
                              {expense.payerName
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .toUpperCase()}
                            </span>
                          </div>
                          <span className="text-sm truncate max-w-[150px]">
                            {expense.payerName}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
