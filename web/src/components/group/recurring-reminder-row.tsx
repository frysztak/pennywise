import { timestampDate } from "@bufbuild/protobuf/wkt";
import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { EditIcon, MoreHorizontal, RepeatIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";

import { AmountWithCurrency } from "@/components/amount-with-currency";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  getGroupRecurringExpenses,
  skipRecurringExpense,
} from "@/gen/api/v1/recurring_expense-RecurringExpenseService_connectquery";
import type { GetGroupRecurringExpensesResponse_RecurringExpense } from "@/gen/api/v1/recurring_expense_pb";
import { RecurringFrequency } from "@/gen/api/v1/recurring_expense_pb";
import { handleError } from "@/lib/utils";

interface RecurringReminderRowProps {
  reminder: GetGroupRecurringExpensesResponse_RecurringExpense;
  groupId: string;
  onPay?: (reminder: GetGroupRecurringExpensesResponse_RecurringExpense) => void;
  onEdit?: (reminder: GetGroupRecurringExpensesResponse_RecurringExpense) => void;
  onDelete?: (reminderId: string) => void;
}

function frequencyToString(freq: RecurringFrequency): string {
  switch (freq) {
    case RecurringFrequency.DAILY:
      return "Daily";
    case RecurringFrequency.WEEKLY:
      return "Weekly";
    case RecurringFrequency.MONTHLY:
      return "Monthly";
    case RecurringFrequency.YEARLY:
      return "Yearly";
    default:
      return "Monthly";
  }
}

export function RecurringReminderRow({ reminder, groupId, onPay, onEdit, onDelete }: RecurringReminderRowProps) {
  const queryClient = useQueryClient();

  const recurringExpensesKey = createConnectQueryKey({
    schema: getGroupRecurringExpenses,
    cardinality: "finite",
    input: { groupId },
  });

  const { mutate: skipMutate, isPending: isSkipping } = useMutation(skipRecurringExpense, {
    onSuccess: (data) => {
      const nextDate = timestampDate(data.nextOccurrence!);
      toast.success(`Skipped. Next: ${nextDate.toLocaleDateString()}`);
      queryClient.invalidateQueries({ queryKey: recurringExpensesKey });
    },
    onError: handleError,
  });

  const handlePay = () => {
    onPay?.(reminder);
  };

  const handleSkip = () => {
    skipMutate({ recurringExpenseId: reminder.id });
  };

  const isPending = isSkipping;
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
            <span className="text-sm truncate max-w-[150px]">{reminder.payerName}</span>
          </div>
        )}
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handlePay} disabled={isPending}>
            Pay
          </Button>
          <Button size="sm" variant="outline" onClick={handleSkip} disabled={isPending}>
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
      </TableCell>
    </TableRow>
  );
}
