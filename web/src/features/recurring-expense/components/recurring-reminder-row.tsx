import { timestampDate } from "@bufbuild/protobuf/wkt";
import { BanknoteArrowUp, CircleOff, EditIcon, MoreHorizontal, RepeatIcon, TrashIcon } from "lucide-react";

import { useSkipRecurringExpense } from "@/features/recurring-expense/hooks/use-skip-recurring-expense";
import { frequencyToString } from "@/features/recurring-expense/recurring-expense";
import type { GetGroupRecurringExpensesResponse_RecurringExpense } from "@/gen/api/v1/recurring_expense_pb";
import { AmountWithCurrency } from "@/shared/components/amount-with-currency";
import { MemberAvatar } from "@/shared/components/member-avatar";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/shared/components/ui/table";

interface RecurringReminderRowProps {
  reminder: GetGroupRecurringExpensesResponse_RecurringExpense;
  groupId: string;
  onPay?: (reminder: GetGroupRecurringExpensesResponse_RecurringExpense) => void;
  onEdit?: (reminder: GetGroupRecurringExpensesResponse_RecurringExpense) => void;
  onDelete?: (reminderId: string) => void;
  isArchived?: boolean;
}

export function RecurringReminderRow({
  reminder,
  groupId,
  onPay,
  onEdit,
  onDelete,
  isArchived,
}: RecurringReminderRowProps) {
  const { mutate: skipMutate, isPending } = useSkipRecurringExpense(groupId);

  const handlePay = () => {
    onPay?.(reminder);
  };

  const handleSkip = () => {
    skipMutate({ recurringExpenseId: reminder.id });
  };

  const dueDate = timestampDate(reminder.nextOccurrence!);
  const formattedDate = dueDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <TableRow className="">
      <TableCell className="text-sm">{formattedDate}</TableCell>

      <TableCell>
        <div className="flex items-center gap-2">
          <RepeatIcon className="h-4 w-4" />
          <span className="font-medium">{reminder.name}</span>
        </div>
        {reminder.description && <div className="text-sm text-muted-foreground mt-1">{reminder.description}</div>}
      </TableCell>

      <TableCell>{frequencyToString(reminder.frequency)}</TableCell>

      <TableCell className="text-right">
        {(reminder.amount !== undefined && reminder.currency && (
          <AmountWithCurrency
            disableColor
            className="text-right"
            balance={[
              {
                amount: BigInt(Math.round(reminder.amount * 100)),
                currency: reminder.currency,
              },
            ]}
          />
        )) ||
          "-"}
      </TableCell>

      <TableCell>
        {reminder.payerName && (
          <div className="flex items-center gap-2">
            <MemberAvatar userId={reminder.payerId || ""} username={reminder.payerName} className="w-6 h-6" />
            <span className="text-sm truncate max-w-37.5">{reminder.payerName}</span>
          </div>
        )}
      </TableCell>

      <TableCell>
        {!isArchived && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handlePay} disabled={isPending}>
              <BanknoteArrowUp />
              Pay
            </Button>
            <Button size="sm" variant="outline" onClick={handleSkip} disabled={isPending}>
              <CircleOff />
              Skip
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={isPending}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit?.(reminder)} disabled={isPending}>
                  <EditIcon />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete?.(reminder.id)}
                  disabled={isPending}
                  className="text-destructive focus:text-destructive"
                  variant="destructive"
                >
                  <TrashIcon />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
