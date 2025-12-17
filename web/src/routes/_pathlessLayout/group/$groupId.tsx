import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  createQueryOptions,
  useSuspenseQuery,
} from "@connectrpc/connect-query";
import { getGroupExpenses } from "@/gen/api/v1/expense-ExpenseService_connectquery";
import { getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { userInfo } from "@/gen/api/v1/user-UserService_connectquery";
import type { GetGroupExpensesResponse_Expense } from "@/gen/api/v1/expense_pb";
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
import { Button } from "@/components/ui/button";
import { Plus, MoreHorizontal, Pencil, Trash } from "lucide-react";
import { NewExpenseModal } from "@/components/expense/new-expense-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { deleteExpense } from "@/gen/api/v1/expense-ExpenseService_connectquery";
import { handleError } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { transport } from "@/transport";

const userGroupsKey = createConnectQueryKey({
  schema: getUserGroups,
  cardinality: "finite",
});

export const Route = createFileRoute("/_pathlessLayout/group/$groupId")({
  component: RouteComponent,
  beforeLoad: async ({ context, params }) => {
    const userGroups = await context.queryClient.ensureQueryData(
      createQueryOptions(getUserGroups, undefined, { transport })
    );

    const group = userGroups.groups.find((g) => g.groupId === params.groupId);

    if (!group) {
      toast.error("Group not found");
      throw redirect({ to: "/dashboard" });
    }
  },
});

function RouteComponent() {
  const { groupId } = Route.useParams();
  const { data: expensesData } = useSuspenseQuery(getGroupExpenses, {
    groupId,
  });
  const { data: groupInfo } = useSuspenseQuery(getUserGroups, undefined, {
    // Group is guaranteed to be found. We're checking if that group exists in `beforeLoad`
    select: (data) => data.groups.find((g) => g.groupId === groupId)!,
  });
  const { data: currentUser } = useSuspenseQuery(userInfo);
  const queryClient = useQueryClient();

  const [editingExpense, setEditingExpense] =
    useState<GetGroupExpensesResponse_Expense | null>(null);
  const [deletingExpense, setDeletingExpense] =
    useState<GetGroupExpensesResponse_Expense | null>(null);

  // Find current user's balance from member balances
  const currentUserBalance = groupInfo.memberBalances.find(
    (mb) => mb.userId === currentUser.id
  )!;

  const groupExpensesKey = createConnectQueryKey({
    schema: getGroupExpenses,
    cardinality: "finite",
    input: { groupId },
  });

  const { mutate: deleteMutate } = useMutation(deleteExpense, {
    onSuccess: () => {
      toast.success("Expense deleted!");
      queryClient.invalidateQueries({ queryKey: groupExpensesKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      setDeletingExpense(null);
    },
    onError: handleError,
  });

  const handleDeleteConfirm = () => {
    if (deletingExpense) {
      deleteMutate({ id: deletingExpense.id });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              {groupInfo.groupName}
            </h1>
            <p className="text-muted-foreground mt-2">
              {groupInfo.groupDescription ||
                "Manage and track shared expenses for your group."}
            </p>
          </div>
          <NewExpenseModal
            groupId={groupId}
            groupMembers={groupInfo.memberBalances}
            currentUserId={currentUser.id}
            defaultCurrency={groupInfo.groupDefaultCurrency}
          >
            <Button>
              <Plus className="h-4 w-4" />
              Add Expense
            </Button>
          </NewExpenseModal>
        </div>

        {/* Balance Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="">
            <CardHeader>
              <CardTitle className="text-lg">Your total balance</CardTitle>
            </CardHeader>
            <CardContent>
              <AmountWithCurrency
                balance={currentUserBalance.balance}
                defaultCurrency={groupInfo.groupDefaultCurrency}
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
                balance={groupInfo.totalSpending}
                defaultCurrency={groupInfo.groupDefaultCurrency}
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
            {groupInfo.memberBalances
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
                        defaultCurrency={groupInfo.groupDefaultCurrency}
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
                  <TableHead className="w-[50px]"></TableHead>
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
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setEditingExpense(expense)}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeletingExpense(expense)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Edit Expense Modal */}
        {editingExpense && (
          <NewExpenseModal
            groupId={groupId}
            groupMembers={groupInfo.memberBalances}
            currentUserId={currentUser.id}
            defaultCurrency={groupInfo.groupDefaultCurrency}
            expense={editingExpense}
            onClose={() => setEditingExpense(null)}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={!!deletingExpense}
          onOpenChange={(open) => !open && setDeletingExpense(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete expense</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingExpense?.name}"? This
                action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
