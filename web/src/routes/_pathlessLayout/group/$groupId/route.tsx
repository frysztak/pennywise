import { createQueryOptions, useSuspenseQuery } from "@connectrpc/connect-query";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";

import { DeleteExpenseDialog } from "@/features/expense/components/delete-expense-dialog";
import { ExpenseModal } from "@/features/expense/components/expense-modal";
import { useDeleteExpenseModal } from "@/features/expense/hooks/use-delete-expense-modal";
import { useExpenseModal } from "@/features/expense/hooks/use-expense-modal";
import { AddMemberDialog } from "@/features/group/components/add-member-dialog";
import { DeleteGroupDialog } from "@/features/group/components/delete-group-dialog";
import { EditGroupDialog } from "@/features/group/components/edit-group-dialog";
import { EditGroupImageDialog } from "@/features/group/components/edit-group-image-dialog";
import { GroupHeader } from "@/features/group/components/group-header";
import { GroupTabs } from "@/features/group/components/group-tabs";
import { useAddMemberModal } from "@/features/group/hooks/use-add-member-modal";
import { useDeleteGroupModal } from "@/features/group/hooks/use-delete-group-modal";
import { useEditGroupImageModal } from "@/features/group/hooks/use-edit-group-image-modal";
import { useEditGroupModal } from "@/features/group/hooks/use-edit-group-modal";
import { useGroupMutations } from "@/features/group/hooks/use-group-mutations";
import { GroupPageProvider } from "@/features/group/hooks/use-group-page-context";
import { DeleteRecurringExpenseDialog } from "@/features/recurring-expense/components/delete-recurring-expense-dialog";
import { RecurringExpenseModal } from "@/features/recurring-expense/components/recurring-expense-modal";
import { useDeleteRecurringExpenseModal } from "@/features/recurring-expense/hooks/use-delete-recurring-expense-modal";
import { useRecurringExpenseModal } from "@/features/recurring-expense/hooks/use-recurring-expense-modal";
import { DeleteTransferDialog } from "@/features/transfer/components/delete-transfer-dialog";
import { TransferModal } from "@/features/transfer/components/transfer-modal";
import { useDeleteTransferModal } from "@/features/transfer/hooks/use-delete-transfer-modal";
import { useTransferModal } from "@/features/transfer/hooks/use-transfer-modal";
import { getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { GroupArchiveFilter, type UserGroup } from "@/gen/api/v1/group_pb";
import { userInfo } from "@/gen/api/v1/user-UserService_connectquery";
import i18n from "@/i18n";
import { transport } from "@/transport";

export const Route = createFileRoute("/_pathlessLayout/group/$groupId")({
  component: RouteComponent,
  beforeLoad: async ({ context, params }) => {
    const opts = createQueryOptions(getUserGroups, { filter: GroupArchiveFilter.ALL }, { transport });

    let userGroups = await context.queryClient.ensureQueryData(opts);
    let group = userGroups.groups.find((g) => g.groupId === params.groupId);

    if (!group) {
      // The cache can be stale right after creating a group: the {filter: ALL}
      // query isn't mounted on the dashboard, so invalidation marks it stale
      // without refetching. Confirm with the server before deciding it's missing.
      userGroups = await context.queryClient.fetchQuery(opts);
      group = userGroups.groups.find((g) => g.groupId === params.groupId);
    }

    if (!group) {
      toast.error(i18n.t("group.notFound"));
      throw redirect({ to: "/dashboard" });
    }
  },
  loader: async ({ params, context }) => {
    const userGroups = await context.queryClient.ensureQueryData(
      createQueryOptions(getUserGroups, { filter: GroupArchiveFilter.ALL }, { transport }),
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
  const { data: groupInfo } = useSuspenseQuery(
    getUserGroups,
    { filter: GroupArchiveFilter.ALL },
    {
      // Group is guaranteed to be found. We're checking if that group exists in `beforeLoad`
      select: (data) => data.groups.find((g) => g.groupId === groupId)!,
    },
  );
  const { data: currentUser } = useSuspenseQuery(userInfo);

  const groupMutations = useGroupMutations(groupId);
  const expenseModal = useExpenseModal();
  const transferModal = useTransferModal();
  const recurringExpenseModal = useRecurringExpenseModal();
  const deleteExpenseModal = useDeleteExpenseModal(groupId);
  const deleteTransferModal = useDeleteTransferModal(groupId);
  const deleteRecurringExpenseModal = useDeleteRecurringExpenseModal(groupId);
  const deleteGroupModal = useDeleteGroupModal();
  const addMemberModal = useAddMemberModal();
  const editGroupModal = useEditGroupModal();
  const editGroupImageModal = useEditGroupImageModal();

  return (
    <>
      {/* Header */}
      <GroupHeader
        groupId={groupId}
        groupName={groupInfo.groupName}
        groupDescription={groupInfo.groupDescription}
        imageUpdatedAt={groupInfo.imageUpdatedAt}
        members={groupInfo.memberBalances.map((m) => ({ userId: m.userId, userName: m.userName }))}
        isPinned={groupInfo.pinned}
        isArchived={groupInfo.archived}
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
            imageUpdatedAt: groupInfo.imageUpdatedAt,
          })
        }
        onEditImage={() => editGroupImageModal.openModal(groupId)}
        onDeleteGroup={() =>
          deleteGroupModal.confirmDelete({
            groupId,
            groupName: groupInfo.groupName,
          })
        }
        onTogglePin={() => groupMutations.setGroupPinned(groupId, !groupInfo.pinned)}
        onToggleArchive={() => groupMutations.setGroupArchived(groupId, !groupInfo.archived)}
      />

      <div className="mt-68 md:mt-64">
        <GroupTabs groupId={groupId} />
        <GroupPageProvider
          value={{
            groupId,
            groupInfo,
            currentUserId: currentUser.id,
            expenseModal,
            transferModal,
            recurringExpenseModal,
            deleteExpenseModal,
            deleteTransferModal,
            deleteRecurringExpenseModal,
            deleteGroupModal,
          }}
        >
          <Outlet />
        </GroupPageProvider>
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
        currencies={groupInfo.currencies}
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
        currencies={groupInfo.currencies}
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
        currencies={groupInfo.currencies}
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
          currencies={groupInfo.currencies}
        />
      )}
      {editGroupImageModal.dialogProps.open && editGroupImageModal.dialogProps.groupId && (
        <EditGroupImageDialog {...editGroupImageModal.dialogProps} groupId={editGroupImageModal.dialogProps.groupId} />
      )}
    </>
  );
}
