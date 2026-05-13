import { timestampDate } from "@bufbuild/protobuf/wkt";
import { EditIcon, MoreHorizontal, RepeatIcon, TrashIcon } from "lucide-react";

import { AmountWithCurrency } from "@/components/amount-with-currency";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { GetGroupRecurringExpensesResponse_RecurringExpense } from "@/gen/api/v1/recurring_expense_pb";
import { useSkipRecurringExpense } from "@/hooks/use-skip-recurring-expense";
import { frequencyToString } from "@/lib/recurring-expense";

interface RecurringReminderCardProps {
  reminder: GetGroupRecurringExpensesResponse_RecurringExpense;
  groupId: string;
  onPay?: (reminder: GetGroupRecurringExpensesResponse_RecurringExpense) => void;
  onEdit?: (reminder: GetGroupRecurringExpensesResponse_RecurringExpense) => void;
  onDelete?: (reminderId: string) => void;
}

export function RecurringReminderCard({ reminder, groupId, onPay, onEdit, onDelete }: RecurringReminderCardProps) {
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
    <Card className="p-3">
      <CardContent className="flex flex-col gap-2 px-0">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {formattedDate} · {frequencyToString(reminder.frequency)}
          </span>
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

        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2">
              <RepeatIcon className="h-4 w-4 shrink-0" />
              <span className="font-medium line-clamp-1">{reminder.name}</span>
            </div>
            {reminder.description && <p className="text-sm text-muted-foreground line-clamp-2">{reminder.description}</p>}
          </div>
          {reminder.amount !== undefined && reminder.currency && (
            <AmountWithCurrency
              disableColor
              className="font-medium text-lg shrink-0"
              balance={[
                {
                  amount: BigInt(Math.round(reminder.amount * 100)),
                  currency: reminder.currency,
                },
              ]}
            />
          )}
        </div>

        {reminder.payerName && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MemberAvatar userId={reminder.payerId || ""} username={reminder.payerName} className="w-6 h-6" />
            <span className="line-clamp-1">paid by {reminder.payerName}</span>
          </div>
        )}

        <div className="flex gap-2">
          <Button className="flex-1" onClick={handlePay} disabled={isPending}>
            Pay
          </Button>
          <Button className="flex-1" variant="outline" onClick={handleSkip} disabled={isPending}>
            Skip
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
