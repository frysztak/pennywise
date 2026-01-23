import { createQueryOptions, useSuspenseQuery } from "@connectrpc/connect-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Suspense } from "react";
import { toast } from "sonner";

import { ExpenseModal } from "@/components/expense/expense-modal";
import { ActivitySection } from "@/components/group/activity-section";
import { AddMemberDialog } from "@/components/group/add-member-dialog";
import { BalanceCards } from "@/components/group/balance-cards";
import { DeleteExpenseDialog } from "@/components/group/delete-expense-dialog";
import { DeleteGroupDialog } from "@/components/group/delete-group-dialog";
import { DeleteRecurringExpenseDialog } from "@/components/group/delete-recurring-expense-dialog";
import { DeleteTransferDialog } from "@/components/group/delete-transfer-dialog";
import { EditGroupDialog } from "@/components/group/edit-group-dialog";
import { GroupBalances } from "@/components/group/group-balances";
import { GroupHeader } from "@/components/group/group-header";
import { RecurringRemindersSection } from "@/components/group/recurring-reminders-section";
import { SettlementSuggestions } from "@/components/group/settlement-suggestions";
import { RecurringExpenseModal } from "@/components/recurring-expense/recurring-expense-modal";
import { TransferModal } from "@/components/transfer/transfer-modal";
import { Spinner } from "@/components/ui/spinner";
import { getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import type { UserGroup } from "@/gen/api/v1/group_pb";
import { userInfo } from "@/gen/api/v1/user-UserService_connectquery";
import { useAddMemberModal } from "@/hooks/use-add-member-modal";
import { useDeleteExpenseModal } from "@/hooks/use-delete-expense-modal";
import { useDeleteGroupModal } from "@/hooks/use-delete-group-modal";
import { useDeleteRecurringExpenseModal } from "@/hooks/use-delete-recurring-expense-modal";
import { useDeleteTransferModal } from "@/hooks/use-delete-transfer-modal";
import { useEditGroupModal } from "@/hooks/use-edit-group-modal";
import { useExpenseModal } from "@/hooks/use-expense-modal";
import { useRecurringExpenseModal } from "@/hooks/use-recurring-expense-modal";
import { useTransferModal } from "@/hooks/use-transfer-modal";
import { transport } from "@/transport";

export const Route = createFileRoute("/_pathlessLayout/group/$groupId")({
  component: RouteComponent,
  beforeLoad: async ({ context, params }) => {
    const userGroups = await context.queryClient.ensureQueryData(
      createQueryOptions(getUserGroups, undefined, { transport }),
    );

    const group = userGroups.groups.find((g) => g.groupId === params.groupId);

    if (!group) {
      toast.error("Group not found");
      throw redirect({ to: "/dashboard" });
    }
  },
  loader: async ({ params, context }) => {
    const userGroups = await context.queryClient.ensureQueryData(
      createQueryOptions(getUserGroups, undefined, { transport }),
    );

    const group = userGroups.groups.find((g) => g.groupId === params.groupId);
    return group;
  },
  head: (ctx) => {
    const group = ctx.loaderData as UserGroup;

    return { meta: [{ title: `${group.groupName} group` }] };
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
  const recurringExpenseModal = useRecurringExpenseModal();
  const deleteExpenseModal = useDeleteExpenseModal(groupId);
  const deleteTransferModal = useDeleteTransferModal(groupId);
  const deleteRecurringExpenseModal = useDeleteRecurringExpenseModal(groupId);
  const deleteGroupModal = useDeleteGroupModal();
  const addMemberModal = useAddMemberModal();
  const editGroupModal = useEditGroupModal();

  // Find current user's balance from member balances
  const currentUserBalance = groupInfo.memberBalances.find((mb) => mb.userId === currentUser.id)!;

  return (
    <>
      {/* Header */}
      <GroupHeader
        groupName={groupInfo.groupName}
        groupDescription={groupInfo.groupDescription}
        onCreateExpense={expenseModal.openCreate}
        onCreateTransfer={transferModal.openCreate}
        onCreateRecurring={recurringExpenseModal.openCreate}
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
      <h2 className="text-xl font-bold mb-4">Group Balances</h2>
      <GroupBalances
        memberBalances={groupInfo.memberBalances}
        currentUserId={currentUser.id}
        defaultCurrency={groupInfo.groupDefaultCurrency}
      />

      {/* Settlement Suggestions */}
      <div>
        <h2 className="text-xl font-bold mb-4">Settle Up</h2>
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-32">
              <Spinner className="size-8" />
            </div>
          }
        >
          <SettlementSuggestions
            groupId={groupId}
            currentUserId={currentUser.id}
            onSettle={transferModal.openCreate}
          />
        </Suspense>
      </div>

      {/* Recurring Reminders */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-64">
            <Spinner className="size-8" />
          </div>
        }
      >
        <RecurringRemindersSection
          groupId={groupId}
          onPayReminder={(reminder) =>
            expenseModal.openCreate(
              {
                name: reminder.name,
                description: reminder.description,
                amount: reminder.amount,
                currency: reminder.currency,
                payerId: reminder.payerId,
              },
              reminder.id,
            )
          }
          onEditReminder={(reminder) => recurringExpenseModal.openEdit(reminder)}
          onDeleteReminder={(reminderId) => deleteRecurringExpenseModal.confirmDelete(reminderId)}
        />
      </Suspense>

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
        templateDefaults={expenseModal.modalState.templateDefaults}
        recurringExpenseId={expenseModal.modalState.recurringExpenseId}
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
        templateDefaults={transferModal.modalState.templateDefaults}
        groupId={groupId}
        groupMembers={groupInfo.memberBalances}
        currentUserId={currentUser.id}
        defaultCurrency={groupInfo.groupDefaultCurrency}
      />

      {/* Recurring Expense Modal (Create/Edit) */}
      <RecurringExpenseModal
        open={recurringExpenseModal.modalState.open}
        onOpenChange={(open) => !open && recurringExpenseModal.close()}
        mode={recurringExpenseModal.modalState.mode}
        recurringExpense={recurringExpenseModal.modalState.recurringExpense}
        groupId={groupId}
        groupMembers={groupInfo.memberBalances}
        currentUserId={currentUser.id}
        defaultCurrency={groupInfo.groupDefaultCurrency}
      />

      <DeleteExpenseDialog {...deleteExpenseModal.dialogProps} />
      <DeleteTransferDialog {...deleteTransferModal.dialogProps} />
      <DeleteRecurringExpenseDialog {...deleteRecurringExpenseModal.dialogProps} />
      <DeleteGroupDialog {...deleteGroupModal.dialogProps} />
      {addMemberModal.dialogProps.open && <AddMemberDialog {...addMemberModal.dialogProps} />}
      {editGroupModal.dialogProps.open && editGroupModal.dialogProps.group && (
        <EditGroupDialog
          {...editGroupModal.dialogProps}
          group={editGroupModal.dialogProps.group}
          memberBalances={groupInfo.memberBalances}
        />
      )}
    </>
  );
}
