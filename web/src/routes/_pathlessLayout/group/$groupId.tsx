import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  createQueryOptions,
  useSuspenseQuery,
} from "@connectrpc/connect-query";
import { getGroupExpenses } from "@/gen/api/v1/expense-ExpenseService_connectquery";
import { getGroupTransfers } from "@/gen/api/v1/transfer-TransferService_connectquery";
import { getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { userInfo } from "@/gen/api/v1/user-UserService_connectquery";
import { ExpenseModal } from "@/components/expense/expense-modal";
import { TransferModal } from "@/components/transfer/transfer-modal";
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
import { toast } from "sonner";
import { transport } from "@/transport";
import { GroupHeader } from "@/components/group/group-header";
import { BalanceCards } from "@/components/group/balance-cards";
import { GroupBalances } from "@/components/group/group-balances";
import { ActivityTable } from "@/components/group/activity-table";
import { useExpenseModal } from "@/hooks/use-expense-modal";
import { useTransferModal } from "@/hooks/use-transfer-modal";
import { useDeleteConfirmation } from "@/hooks/use-delete-confirmation";
import { useGroupMutations } from "@/hooks/use-group-mutations";
import type { GetGroupExpensesResponse_Expense } from "@/gen/api/v1/expense_pb";
import type { GetGroupTransfersResponse_Transfer } from "@/gen/api/v1/transfer_pb";

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

  const expenseModal = useExpenseModal();
  const transferModal = useTransferModal();
  const expenseDelete =
    useDeleteConfirmation<GetGroupExpensesResponse_Expense>();
  const transferDelete =
    useDeleteConfirmation<GetGroupTransfersResponse_Transfer>();
  const { deleteExpense, deleteTransfer } = useGroupMutations(groupId);

  // Find current user's balance from member balances
  const currentUserBalance = groupInfo.memberBalances.find(
    (mb) => mb.userId === currentUser.id
  )!;

  const handleDeleteExpenseConfirm = () => {
    expenseDelete.handleConfirm((expense) => {
      deleteExpense({ id: expense.id });
      expenseDelete.cancelDelete();
    });
  };

  const handleDeleteTransferConfirm = () => {
    transferDelete.handleConfirm((transfer) => {
      deleteTransfer({ id: transfer.id });
      transferDelete.cancelDelete();
    });
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
      date: new Date(transfer.date),
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <GroupHeader
          groupName={groupInfo.groupName}
          groupDescription={groupInfo.groupDescription}
          onCreateExpense={expenseModal.openCreate}
          onCreateTransfer={transferModal.openCreate}
        />

        {/* Balance Cards */}
        <BalanceCards
          userBalance={currentUserBalance}
          totalSpending={groupInfo.totalSpending}
          defaultCurrency={groupInfo.groupDefaultCurrency}
        />

        {/* Group Balances */}
        <GroupBalances
          memberBalances={groupInfo.memberBalances}
          currentUserId={currentUser.id}
          defaultCurrency={groupInfo.groupDefaultCurrency}
        />

        {/* Recent Activity */}
        <div>
          <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
          <ActivityTable
            recentActivity={recentActivity}
            onEditExpense={expenseModal.openEdit}
            onDeleteExpense={expenseDelete.confirmDelete}
            onEditTransfer={transferModal.openEdit}
            onDeleteTransfer={transferDelete.confirmDelete}
          />
        </div>

        {/* Expense Modal (Create/Edit) */}
        <ExpenseModal
          open={expenseModal.modalState.open}
          onOpenChange={(open) => !open && expenseModal.close()}
          mode={expenseModal.modalState.mode}
          expense={expenseModal.modalState.expense}
          groupId={groupId}
          groupMembers={groupInfo.memberBalances}
          currentUserId={currentUser.id}
          defaultCurrency={groupInfo.groupDefaultCurrency}
        />

        {/* Transfer Modal (Create/Edit) */}
        <TransferModal
          open={transferModal.modalState.open}
          onOpenChange={(open) => !open && transferModal.close()}
          mode={transferModal.modalState.mode}
          transfer={transferModal.modalState.transfer}
          groupId={groupId}
          groupMembers={groupInfo.memberBalances}
          currentUserId={currentUser.id}
          defaultCurrency={groupInfo.groupDefaultCurrency}
        />

        {/* Delete Expense Confirmation Dialog */}
        <AlertDialog
          open={!!expenseDelete.deletingItem}
          onOpenChange={(open) => !open && expenseDelete.cancelDelete()}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete expense</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "
                {expenseDelete.deletingItem?.name}"? This action cannot be
                undone.
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
          open={!!transferDelete.deletingItem}
          onOpenChange={(open) => !open && transferDelete.cancelDelete()}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete transfer</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this transfer from{" "}
                {transferDelete.deletingItem?.senderName} to{" "}
                {transferDelete.deletingItem?.receiverName}? This action cannot
                be undone.
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
