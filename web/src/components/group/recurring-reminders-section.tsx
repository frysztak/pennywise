import { useSuspenseQuery } from "@connectrpc/connect-query";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getGroupRecurringExpenses } from "@/gen/api/v1/recurring_expense-RecurringExpenseService_connectquery";
import type { GetGroupRecurringExpensesResponse_RecurringExpense } from "@/gen/api/v1/recurring_expense_pb";

import { RecurringReminderCard } from "./recurring-reminder-card";
import { RecurringReminderRow } from "./recurring-reminder-row";

interface RecurringRemindersSectionProps {
  groupId: string;
  onPayReminder: (reminder: GetGroupRecurringExpensesResponse_RecurringExpense) => void;
  onEditReminder: (reminder: GetGroupRecurringExpensesResponse_RecurringExpense) => void;
  onDeleteReminder: (reminderId: string) => void;
}

export function RecurringRemindersSection({
  groupId,
  onPayReminder,
  onEditReminder,
  onDeleteReminder,
}: RecurringRemindersSectionProps) {
  const { data: recurringExpensesData } = useSuspenseQuery(getGroupRecurringExpenses, { groupId });

  if (recurringExpensesData.recurringExpenses.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Recurring Reminders</h2>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Due Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="w-[180px]">Actions</TableHead>
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
          />
        ))}
      </div>
    </div>
  );
}
