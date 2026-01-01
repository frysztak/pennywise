import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  createQueryOptions,
  useSuspenseQuery,
} from "@connectrpc/connect-query";
import { getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { userInfo } from "@/gen/api/v1/user-UserService_connectquery";
import { ExpenseModal } from "@/components/expense/expense-modal";
import { TransferModal } from "@/components/transfer/transfer-modal";
import { toast } from "sonner";
import { transport } from "@/transport";
import { GroupHeader } from "@/components/group/group-header";
import { BalanceCards } from "@/components/group/balance-cards";
import { GroupBalances } from "@/components/group/group-balances";
import { ActivitySection } from "@/components/group/activity-section";
import { DeleteGroupDialog } from "@/components/group/delete-group-dialog";
import { DeleteExpenseDialog } from "@/components/group/delete-expense-dialog";
import { DeleteTransferDialog } from "@/components/group/delete-transfer-dialog";
import { AddMemberDialog } from "@/components/group/add-member-dialog";
import { EditGroupDialog } from "@/components/group/edit-group-dialog";
import { useExpenseModal } from "@/hooks/use-expense-modal";
import { useTransferModal } from "@/hooks/use-transfer-modal";
import { useDeleteExpenseModal } from "@/hooks/use-delete-expense-modal";
import { useDeleteTransferModal } from "@/hooks/use-delete-transfer-modal";
import { useDeleteGroupModal } from "@/hooks/use-delete-group-modal";
import { useAddMemberModal } from "@/hooks/use-add-member-modal";
import { useEditGroupModal } from "@/hooks/use-edit-group-modal";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";

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
  const addMemberModal = useAddMemberModal();
  const editGroupModal = useEditGroupModal();

  // Find current user's balance from member balances
  const currentUserBalance = groupInfo.memberBalances.find(
    (mb) => mb.userId === currentUser.id
  )!;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto py-6 px-2 lg:py-6  space-y-6">
        {/* Header */}
        <GroupHeader
          groupName={groupInfo.groupName}
          groupDescription={groupInfo.groupDescription}
          onCreateExpense={expenseModal.openCreate}
          onCreateTransfer={transferModal.openCreate}
          onInviteMembers={() => addMemberModal.openModal(groupId)}
          onEditGroup={() =>
            editGroupModal.openModal({
              groupId,
              groupName: groupInfo.groupName,
              groupDescription: groupInfo.groupDescription,
              defaultCurrency: groupInfo.groupDefaultCurrency,
            })
          }
          onDeleteGroup={() =>
            deleteGroupModal.confirmDelete({
              groupId,
              groupName: groupInfo.groupName,
            })
          }
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
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-64">
                <Spinner className="size-8" />
              </div>
            }
          >
            <ActivitySection
              groupId={groupId}
              onEditExpense={expenseModal.openEdit}
              onDeleteExpense={deleteExpenseModal.confirmDelete}
              onEditTransfer={transferModal.openEdit}
              onDeleteTransfer={deleteTransferModal.confirmDelete}
            />
          </Suspense>
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
        {addMemberModal.dialogProps.open && (
          <AddMemberDialog {...addMemberModal.dialogProps} />
        )}
        {editGroupModal.dialogProps.open && editGroupModal.dialogProps.group && (
          <EditGroupDialog
            {...editGroupModal.dialogProps}
            group={editGroupModal.dialogProps.group}
            memberBalances={groupInfo.memberBalances}
          />
        )}
      </div>
    </div>
  );
}
