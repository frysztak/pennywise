import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import { GroupSections } from "@/features/group/components/group-sections";
import { useGroupPageContext } from "@/features/group/hooks/use-group-page-context";
import { RecurringRemindersSection } from "@/features/recurring-expense/components/recurring-reminders-section";
import { Spinner } from "@/shared/components/ui/spinner";

export const Route = createFileRoute("/_pathlessLayout/group/$groupId/")({
  component: ActivityTab,
});

function ActivityTab() {
  const {
    groupId,
    groupInfo,
    currentUserId,
    expenseModal,
    transferModal,
    conversionModal,
    recurringExpenseModal,
    deleteExpenseModal,
    deleteTransferModal,
    deleteConversionModal,
    deleteRecurringExpenseModal,
  } = useGroupPageContext();

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <Spinner className="size-8" />
        </div>
      }
    >
      <GroupSections
        groupId={groupId}
        memberBalances={groupInfo.memberBalances}
        currencies={groupInfo.currencies}
        currentUserId={currentUserId}
        defaultCurrency={groupInfo.groupDefaultCurrency}
        onSettle={transferModal.openCreate}
        onEditExpense={expenseModal.openEdit}
        onDeleteExpense={deleteExpenseModal.confirmDelete}
        onEditTransfer={transferModal.openEdit}
        onDeleteTransfer={deleteTransferModal.confirmDelete}
        onEditConversion={conversionModal.openEdit}
        onDeleteConversion={deleteConversionModal.confirmDelete}
        isArchived={groupInfo.archived}
        remindersSlot={
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
              isArchived={groupInfo.archived}
            />
          </Suspense>
        }
      />
    </Suspense>
  );
}
