import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  createQueryOptions,
  useSuspenseQuery,
} from "@connectrpc/connect-query";
import { getGroupActivity, getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { userInfo } from "@/gen/api/v1/user-UserService_connectquery";
import { ExpenseModal } from "@/components/expense/expense-modal";
import { TransferModal } from "@/components/transfer/transfer-modal";
import { toast } from "sonner";
import { transport } from "@/transport";
import { GroupHeader } from "@/components/group/group-header";
import { BalanceCards } from "@/components/group/balance-cards";
import { GroupBalances } from "@/components/group/group-balances";
import { ActivityTable } from "@/components/group/activity-table";
import { DeleteGroupDialog } from "@/components/group/delete-group-dialog";
import { DeleteExpenseDialog } from "@/components/group/delete-expense-dialog";
import { DeleteTransferDialog } from "@/components/group/delete-transfer-dialog";
import { useExpenseModal } from "@/hooks/use-expense-modal";
import { useTransferModal } from "@/hooks/use-transfer-modal";
import { useDeleteExpenseModal } from "@/hooks/use-delete-expense-modal";
import { useDeleteTransferModal } from "@/hooks/use-delete-transfer-modal";
import { useDeleteGroupModal } from "@/hooks/use-delete-group-modal";

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
  const { data: activityData } = useSuspenseQuery(getGroupActivity, {
    groupId,
  });
  const { data: groupInfo } = useSuspenseQuery(getUserGroups, undefined, {
    // Group is guaranteed to be found. We're checking if that group exists in `beforeLoad`
    select: (data) => data.groups.find((g) => g.groupId === groupId)!,
  });
  const { data: currentUser } = useSuspenseQuery(userInfo);

  const expenseModal = useExpenseModal();
  const transferModal = useTransferModal();
  const deleteExpenseModal = useDeleteExpenseModal(groupId);
  const deleteTransferModal = useDeleteTransferModal(groupId);
  const deleteGroupModal = useDeleteGroupModal();

  // Find current user's balance from member balances
  const currentUserBalance = groupInfo.memberBalances.find(
    (mb) => mb.userId === currentUser.id
  )!;

  // Transform backend activity items into format expected by ActivityTable
  const recentActivity = activityData.items.map((item) => {
    if (item.data.case === "expense") {
      return {
        type: "expense" as const,
        data: item.data.value,
      };
    } else if (item.data.case === "transfer") {
      return {
        type: "transfer" as const,
        data: item.data.value,
      };
    }
    throw new Error("Unknown activity item type");
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <GroupHeader
          groupName={groupInfo.groupName}
          groupDescription={groupInfo.groupDescription}
          onCreateExpense={expenseModal.openCreate}
          onCreateTransfer={transferModal.openCreate}
          onDeleteGroup={() => deleteGroupModal.confirmDelete({ groupId, groupName: groupInfo.groupName })}
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
            onDeleteExpense={deleteExpenseModal.confirmDelete}
            onEditTransfer={transferModal.openEdit}
            onDeleteTransfer={deleteTransferModal.confirmDelete}
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

        <DeleteExpenseDialog {...deleteExpenseModal.dialogProps} />
        <DeleteTransferDialog {...deleteTransferModal.dialogProps} />
        <DeleteGroupDialog {...deleteGroupModal.dialogProps} />
      </div>
    </div>
  );
}
