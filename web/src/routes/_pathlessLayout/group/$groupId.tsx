import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  createQueryOptions,
  useSuspenseQuery,
} from "@connectrpc/connect-query";
import {
  getGroupExpenses,
  deleteExpense,
} from "@/gen/api/v1/expense-ExpenseService_connectquery";
import {
  getGroupTransfers,
  deleteTransfer,
} from "@/gen/api/v1/transfer-TransferService_connectquery";
import { getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { userInfo } from "@/gen/api/v1/user-UserService_connectquery";
import type { GetGroupExpensesResponse_Expense } from "@/gen/api/v1/expense_pb";
import type { GetGroupTransfersResponse_Transfer } from "@/gen/api/v1/transfer_pb";
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
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash,
  ArrowRight,
  ChevronDownIcon,
  TrashIcon,
  Redo2Icon,
  EditIcon,
  UserRoundSearchIcon,
  BanknoteIcon,
} from "lucide-react";
import { ExpenseModal } from "@/components/expense/expense-modal";
import { TransferModal } from "@/components/transfer/transfer-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { handleError } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { transport } from "@/transport";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";

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
  const { data: transfersData } = useSuspenseQuery(getGroupTransfers, {
    groupId,
  });
  const { data: groupInfo } = useSuspenseQuery(getUserGroups, undefined, {
    // Group is guaranteed to be found. We're checking if that group exists in `beforeLoad`
    select: (data) => data.groups.find((g) => g.groupId === groupId)!,
  });
  const { data: currentUser } = useSuspenseQuery(userInfo);
  const queryClient = useQueryClient();

  const [expenseModalState, setExpenseModalState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    expense?: GetGroupExpensesResponse_Expense;
  }>({
    open: false,
    mode: "create",
    expense: undefined,
  });

  const [transferModalState, setTransferModalState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    transfer?: GetGroupTransfersResponse_Transfer;
  }>({
    open: false,
    mode: "create",
    transfer: undefined,
  });

  const [deletingExpense, setDeletingExpense] =
    useState<GetGroupExpensesResponse_Expense | null>(null);

  const [deletingTransfer, setDeletingTransfer] =
    useState<GetGroupTransfersResponse_Transfer | null>(null);

  // Find current user's balance from member balances
  const currentUserBalance = groupInfo.memberBalances.find(
    (mb) => mb.userId === currentUser.id
  )!;

  const groupExpensesKey = createConnectQueryKey({
    schema: getGroupExpenses,
    cardinality: "finite",
    input: { groupId },
  });

  const groupTransfersKey = createConnectQueryKey({
    schema: getGroupTransfers,
    cardinality: "finite",
    input: { groupId },
  });

  const { mutate: deleteExpenseMutate } = useMutation(deleteExpense, {
    onSuccess: () => {
      toast.success("Expense deleted!");
      queryClient.invalidateQueries({ queryKey: groupExpensesKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      setDeletingExpense(null);
    },
    onError: handleError,
  });

  const { mutate: deleteTransferMutate } = useMutation(deleteTransfer, {
    onSuccess: () => {
      toast.success("Transfer deleted!");
      queryClient.invalidateQueries({ queryKey: groupTransfersKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      setDeletingTransfer(null);
    },
    onError: handleError,
  });

  const handleDeleteExpenseConfirm = () => {
    if (deletingExpense) {
      deleteExpenseMutate({ id: deletingExpense.id });
    }
  };

  const handleDeleteTransferConfirm = () => {
    if (deletingTransfer) {
      deleteTransferMutate({ id: deletingTransfer.id });
    }
  };

  // Expense modal handlers
  const handleOpenCreateExpense = () => {
    setExpenseModalState({ open: true, mode: "create", expense: undefined });
  };

  const handleOpenEditExpense = (expense: GetGroupExpensesResponse_Expense) => {
    setExpenseModalState({ open: true, mode: "edit", expense });
  };

  const handleExpenseModalClose = (open: boolean) => {
    if (!open) {
      setExpenseModalState((prev) => ({ ...prev, open: false }));
    }
  };

  // Transfer modal handlers
  const handleOpenCreateTransfer = () => {
    setTransferModalState({ open: true, mode: "create", transfer: undefined });
  };

  const handleOpenEditTransfer = (
    transfer: GetGroupTransfersResponse_Transfer
  ) => {
    setTransferModalState({ open: true, mode: "edit", transfer });
  };

  const handleTransferModalClose = (open: boolean) => {
    if (!open) {
      setTransferModalState((prev) => ({ ...prev, open: false }));
    }
  };

  // Combine expenses and transfers for recent activity
  type ActivityItem =
    | { type: "expense"; data: GetGroupExpensesResponse_Expense; date: Date }
    | {
        type: "transfer";
        data: GetGroupTransfersResponse_Transfer;
        date: Date;
      };

  const recentActivity: ActivityItem[] = [
    ...expensesData.expenses.map((expense) => ({
      type: "expense" as const,
      data: expense,
      date: new Date(expense.date),
    })),
    ...transfersData.transfers.map((transfer) => ({
      type: "transfer" as const,
      data: transfer,
      date: new Date(transfer.createdAt),
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

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
          <div className="flex gap-2">
            <ButtonGroup>
              <Button onClick={handleOpenCreateExpense}>
                <Plus />
                Add Expense
              </Button>
              <ButtonGroupSeparator />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="pl-2!">
                    <ChevronDownIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="[--radius:1rem]">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={handleOpenCreateTransfer}>
                      <Redo2Icon />
                      Add Transfer
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem>
                      <EditIcon />
                      Edit Group
                    </DropdownMenuItem>

                    <DropdownMenuItem>
                      <UserRoundSearchIcon />
                      Invite Members
                    </DropdownMenuItem>

                    <DropdownMenuItem variant="destructive">
                      <TrashIcon />
                      Delete Group
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </ButtonGroup>
          </div>
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
          {recentActivity.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">
                  No activity yet in this group.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentActivity.map((item) => {
                  const formattedDate = item.date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });

                  if (item.type === "expense") {
                    const expense = item.data;
                    return (
                      <TableRow key={`expense-${expense.id}`}>
                        <TableCell className="text-sm">
                          {formattedDate}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <BanknoteIcon className="h-4 w-4" />
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
                              paid by {expense.payerName}
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
                                onClick={() => handleOpenEditExpense(expense)}
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
                  } else {
                    const transfer = item.data;
                    return (
                      <TableRow key={`transfer-${transfer.id}`}>
                        <TableCell className="text-sm">
                          {formattedDate}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Redo2Icon className="h-4 w-4" />
                            <span>Transfer</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <AmountWithCurrency
                            disableColor
                            className="text-right"
                            balance={[
                              {
                                amount: transfer.amount,
                                currency: transfer.currency,
                              },
                            ]}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <span className="truncate max-w-[80px]">
                              {transfer.senderName}
                            </span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate max-w-[80px]">
                              {transfer.receiverName}
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
                                onClick={() => handleOpenEditTransfer(transfer)}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeletingTransfer(transfer)}
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
                  }
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Expense Modal (Create/Edit) */}
        <ExpenseModal
          open={expenseModalState.open}
          onOpenChange={handleExpenseModalClose}
          mode={expenseModalState.mode}
          expense={expenseModalState.expense}
          groupId={groupId}
          groupMembers={groupInfo.memberBalances}
          currentUserId={currentUser.id}
          defaultCurrency={groupInfo.groupDefaultCurrency}
        />

        {/* Transfer Modal (Create/Edit) */}
        <TransferModal
          open={transferModalState.open}
          onOpenChange={handleTransferModalClose}
          mode={transferModalState.mode}
          transfer={transferModalState.transfer}
          groupId={groupId}
          groupMembers={groupInfo.memberBalances}
          currentUserId={currentUser.id}
          defaultCurrency={groupInfo.groupDefaultCurrency}
        />

        {/* Delete Expense Confirmation Dialog */}
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
                onClick={handleDeleteExpenseConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Transfer Confirmation Dialog */}
        <AlertDialog
          open={!!deletingTransfer}
          onOpenChange={(open) => !open && setDeletingTransfer(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete transfer</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this transfer from{" "}
                {deletingTransfer?.senderName} to{" "}
                {deletingTransfer?.receiverName}? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteTransferConfirm}
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
