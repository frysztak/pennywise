import { timestampDate } from "@bufbuild/protobuf/wkt";
import { ArrowRight, BanknoteIcon, ReceiptText, Redo2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ActivityItemMenu } from "@/features/group/components/activity-item-menu";
import type {
  GetGroupActivityResponse_ActivityItem_Expense,
  GetGroupActivityResponse_ActivityItem_Transfer,
} from "@/gen/api/v1/group_pb";
import { AmountWithCurrency } from "@/shared/components/amount-with-currency";
import { MemberAvatar } from "@/shared/components/member-avatar";
import { Card, CardContent } from "@/shared/components/ui/card";

type ActivityItem =
  | { type: "expense"; data: GetGroupActivityResponse_ActivityItem_Expense }
  | { type: "transfer"; data: GetGroupActivityResponse_ActivityItem_Transfer };

interface ActivityCardsProps {
  recentActivity: ActivityItem[];
  onEditExpense: (expense: GetGroupActivityResponse_ActivityItem_Expense) => void;
  onDeleteExpense: (expense: GetGroupActivityResponse_ActivityItem_Expense) => void;
  onEditTransfer: (transfer: GetGroupActivityResponse_ActivityItem_Transfer) => void;
  onDeleteTransfer: (transfer: GetGroupActivityResponse_ActivityItem_Transfer) => void;
  isArchived?: boolean;
}

export function ActivityCards({
  recentActivity,
  onEditExpense,
  onDeleteExpense,
  onEditTransfer,
  onDeleteTransfer,
  isArchived,
}: ActivityCardsProps) {
  const { t } = useTranslation();
  if (recentActivity.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("activity.empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {recentActivity.map((item) => {
        const date = timestampDate(item.data.date!);
        const formattedDate = date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });

        if (item.type === "expense") {
          const expense = item.data;
          return (
            <Card key={`expense-${expense.id}`}>
              <CardContent className="flex flex-col gap-2 ">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{formattedDate}</span>
                  {!isArchived && (
                    <ActivityItemMenu onEdit={() => onEditExpense(expense)} onDelete={() => onDeleteExpense(expense)} />
                  )}
                </div>
                <div className="flex flex-col items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ReceiptText className="h-6 w-6 shrink-0 text-muted-foreground" />
                    <span className="font-medium text-lg break-normal">{expense.name}</span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <BanknoteIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
                    <AmountWithCurrency disableColor className="font-medium text-lg" balance={[expense]} />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MemberAvatar userId={expense.payerId} username={expense.payerName} className="w-6 h-6" />
                  <span className="line-clamp-1">paid by {expense.payerName}</span>
                </div>
              </CardContent>
            </Card>
          );
        }

        const transfer = item.data;
        return (
          <Card key={`transfer-${transfer.id}`}>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{formattedDate}</span>
                {!isArchived && (
                  <ActivityItemMenu
                    onEdit={() => onEditTransfer(transfer)}
                    onDelete={() => onDeleteTransfer(transfer)}
                  />
                )}
              </div>
              <div className="flex flex-col items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Redo2Icon className="h-6 w-6 shrink-0 text-muted-foreground" />
                  <span className="font-medium text-lg">{t("activity.transfer")}</span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <BanknoteIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
                  <AmountWithCurrency
                    disableColor
                    className="font-medium text-lg"
                    balance={[{ amount: transfer.amount, currency: transfer.currency }]}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MemberAvatar userId={transfer.senderId} username={transfer.senderName} className="w-6 h-6" />
                <span className="line-clamp-1">{transfer.senderName}</span>
                <ArrowRight className="h-3 w-3 shrink-0" />
                <MemberAvatar userId={transfer.receiverId} username={transfer.receiverName} className="w-6 h-6" />
                <span className="line-clamp-1">{transfer.receiverName}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
