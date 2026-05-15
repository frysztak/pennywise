import { timestampDate } from "@bufbuild/protobuf/wkt";
import { ArrowRight, BanknoteIcon, Redo2Icon } from "lucide-react";

import { AmountWithCurrency } from "@/components/amount-with-currency";
import { ActivityItemMenu } from "@/components/group/activity-item-menu";
import { MemberAvatar } from "@/components/member-avatar";
import { Card, CardContent } from "@/components/ui/card";
import type {
  GetGroupActivityResponse_ActivityItem_Expense,
  GetGroupActivityResponse_ActivityItem_Transfer,
} from "@/gen/api/v1/group_pb";

type ActivityItem =
  | { type: "expense"; data: GetGroupActivityResponse_ActivityItem_Expense }
  | { type: "transfer"; data: GetGroupActivityResponse_ActivityItem_Transfer };

interface ActivityCardsProps {
  recentActivity: ActivityItem[];
  onEditExpense: (expense: GetGroupActivityResponse_ActivityItem_Expense) => void;
  onDeleteExpense: (expense: GetGroupActivityResponse_ActivityItem_Expense) => void;
  onEditTransfer: (transfer: GetGroupActivityResponse_ActivityItem_Transfer) => void;
  onDeleteTransfer: (transfer: GetGroupActivityResponse_ActivityItem_Transfer) => void;
}

export function ActivityCards({
  recentActivity,
  onEditExpense,
  onDeleteExpense,
  onEditTransfer,
  onDeleteTransfer,
}: ActivityCardsProps) {
  if (recentActivity.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">No activity yet in this group.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
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
            <Card key={`expense-${expense.id}`} className="p-3">
              <CardContent className="flex flex-col gap-2 px-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{formattedDate}</span>
                  <ActivityItemMenu onEdit={() => onEditExpense(expense)} onDelete={() => onDeleteExpense(expense)} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <BanknoteIcon className="h-4 w-4 shrink-0" />
                    <span className="font-medium line-clamp-1">{expense.name}</span>
                  </div>
                  <AmountWithCurrency disableColor className="font-medium text-lg" balance={[expense]} />
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
          <Card key={`transfer-${transfer.id}`} className="p-3">
            <CardContent className="flex flex-col gap-2 px-0">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{formattedDate}</span>
                <ActivityItemMenu onEdit={() => onEditTransfer(transfer)} onDelete={() => onDeleteTransfer(transfer)} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Redo2Icon className="h-4 w-4 shrink-0" />
                  <span className="font-medium">Transfer</span>
                </div>
                <AmountWithCurrency
                  disableColor
                  className="font-medium text-lg"
                  balance={[{ amount: transfer.amount, currency: transfer.currency }]}
                />
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
