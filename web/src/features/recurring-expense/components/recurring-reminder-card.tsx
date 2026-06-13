import { timestampDate } from "@bufbuild/protobuf/wkt";
import {
  BanknoteArrowUp,
  BanknoteIcon,
  CircleOff,
  EditIcon,
  MoreHorizontal,
  RepeatIcon,
  TrashIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { useSkipRecurringExpense } from "@/features/recurring-expense/hooks/use-skip-recurring-expense";
import { frequencyToKey } from "@/features/recurring-expense/recurring-expense";
import type { GetGroupRecurringExpensesResponse_RecurringExpense } from "@/gen/api/v1/recurring_expense_pb";
import { AmountWithCurrency } from "@/shared/components/amount-with-currency";
import { MemberAvatar } from "@/shared/components/member-avatar";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

interface RecurringReminderCardProps {
  reminder: GetGroupRecurringExpensesResponse_RecurringExpense;
  groupId: string;
  onPay?: (reminder: GetGroupRecurringExpensesResponse_RecurringExpense) => void;
  onEdit?: (reminder: GetGroupRecurringExpensesResponse_RecurringExpense) => void;
  onDelete?: (reminderId: string) => void;
  isArchived?: boolean;
}

export function RecurringReminderCard({
  reminder,
  groupId,
  onPay,
  onEdit,
  onDelete,
  isArchived,
}: RecurringReminderCardProps) {
  const { t } = useTranslation();
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
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {formattedDate} · {t(frequencyToKey(reminder.frequency))}
          </span>
          {!isArchived && (
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
                  {t("common.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete?.(reminder.id)}
                  disabled={isPending}
                  className="text-destructive focus:text-destructive"
                  variant="destructive"
                >
                  <TrashIcon />
                  {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="flex flex-col items-start justify-between gap-2">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2">
              <RepeatIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
              <span className="font-medium text-lg">{reminder.name}</span>
            </div>
            {reminder.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{reminder.description}</p>
            )}
          </div>
          {reminder.amount !== undefined && reminder.currency && (
            <div className="flex items-center gap-2 min-w-0">
              <BanknoteIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
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
            </div>
          )}
        </div>

        {reminder.payerName && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MemberAvatar userId={reminder.payerId || ""} username={reminder.payerName} className="w-6 h-6" />
            <span className="line-clamp-1">{t("activity.paidBy", { name: reminder.payerName })}</span>
          </div>
        )}

        {!isArchived && (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handlePay} disabled={isPending}>
              <BanknoteArrowUp />
              {t("recurringExpense.pay")}
            </Button>
            <Button className="flex-1" variant="outline" onClick={handleSkip} disabled={isPending}>
              <CircleOff />
              {t("recurringExpense.skip")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
