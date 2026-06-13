import { useSuspenseQuery } from "@connectrpc/connect-query";
import { useTranslation } from "react-i18next";

import { RecurringReminderCard } from "@/features/recurring-expense/components/recurring-reminder-card";
import { RecurringReminderRow } from "@/features/recurring-expense/components/recurring-reminder-row";
import { getGroupRecurringExpenses } from "@/gen/api/v1/recurring_expense-RecurringExpenseService_connectquery";
import type { GetGroupRecurringExpensesResponse_RecurringExpense } from "@/gen/api/v1/recurring_expense_pb";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";

interface RecurringRemindersSectionProps {
  groupId: string;
  onPayReminder: (reminder: GetGroupRecurringExpensesResponse_RecurringExpense) => void;
  onEditReminder: (reminder: GetGroupRecurringExpensesResponse_RecurringExpense) => void;
  onDeleteReminder: (reminderId: string) => void;
  isArchived?: boolean;
}

export function RecurringRemindersSection({
  groupId,
  onPayReminder,
  onEditReminder,
  onDeleteReminder,
  isArchived,
}: RecurringRemindersSectionProps) {
  const { t } = useTranslation();
  const { data: recurringExpensesData } = useSuspenseQuery(getGroupRecurringExpenses, { groupId });

  if (recurringExpensesData.recurringExpenses.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">{t("recurringExpense.reminders.title")}</h2>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("recurringExpense.reminders.dueDate")}</TableHead>
              <TableHead>{t("recurringExpense.reminders.description")}</TableHead>
              <TableHead>{t("recurringExpense.reminders.frequency")}</TableHead>
              <TableHead className="text-right">{t("recurringExpense.reminders.amount")}</TableHead>
              <TableHead>{t("recurringExpense.reminders.details")}</TableHead>
              <TableHead className="w-45">{t("recurringExpense.reminders.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recurringExpensesData.recurringExpenses.map((reminder) => (
              <RecurringReminderRow
                key={reminder.id}
                reminder={reminder}
                groupId={groupId}
                onPay={onPayReminder}
                onEdit={onEditReminder}
                onDelete={onDeleteReminder}
                isArchived={isArchived}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="md:hidden flex flex-col gap-2">
        {recurringExpensesData.recurringExpenses.map((reminder) => (
          <RecurringReminderCard
            key={reminder.id}
            reminder={reminder}
            groupId={groupId}
            onPay={onPayReminder}
            onEdit={onEditReminder}
            onDelete={onDeleteReminder}
            isArchived={isArchived}
          />
        ))}
      </div>
    </div>
  );
}
