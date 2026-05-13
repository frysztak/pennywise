import { timestampDate } from "@bufbuild/protobuf/wkt";
import { ArrowRight, BanknoteIcon, Redo2Icon } from "lucide-react";

import { AmountWithCurrency } from "@/components/amount-with-currency";
import { ActivityItemMenu } from "@/components/group/activity-item-menu";
import { MemberAvatar } from "@/components/member-avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
  GetGroupActivityResponse_ActivityItem_Expense,
  GetGroupActivityResponse_ActivityItem_Transfer,
} from "@/gen/api/v1/group_pb";

type ActivityItem =
  | { type: "expense"; data: GetGroupActivityResponse_ActivityItem_Expense }
  | { type: "transfer"; data: GetGroupActivityResponse_ActivityItem_Transfer };

interface ActivityTableProps {
  recentActivity: ActivityItem[];
  onEditExpense: (expense: GetGroupActivityResponse_ActivityItem_Expense) => void;
  onDeleteExpense: (expense: GetGroupActivityResponse_ActivityItem_Expense) => void;
  onEditTransfer: (transfer: GetGroupActivityResponse_ActivityItem_Transfer) => void;
  onDeleteTransfer: (transfer: GetGroupActivityResponse_ActivityItem_Transfer) => void;
}

export function ActivityTable({
  recentActivity,
  onEditExpense,
  onDeleteExpense,
  onEditTransfer,
  onDeleteTransfer,
}: ActivityTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Details</TableHead>
          <TableHead className="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
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
              <TableRow key={`expense-${expense.id}`}>
                <TableCell className="text-sm">{formattedDate}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <BanknoteIcon className="h-4 w-4" />
                    <span>{expense.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <AmountWithCurrency disableColor className="text-right" balance={[expense]} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <MemberAvatar userId={expense.payerId} username={expense.payerName} className="w-6 h-6" />
                    <span className="text-sm line-clamp-1">paid by {expense.payerName}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <ActivityItemMenu
                    onEdit={() => onEditExpense(expense)}
                    onDelete={() => onDeleteExpense(expense)}
                  />
                </TableCell>
              </TableRow>
            );
          } else {
            const transfer = item.data;
            return (
              <TableRow key={`transfer-${transfer.id}`}>
                <TableCell className="text-sm">{formattedDate}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Redo2Icon className="h-4 w-4" />
                    <span>Transfer</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <AmountWithCurrency
                    disableColor
                    className="text-right"
                    balance={[
                      {
                        amount: transfer.amount,
                        currency: transfer.currency,
                      },
                    ]}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-sm">
                    <MemberAvatar userId={transfer.senderId} username={transfer.senderName} className="w-6 h-6" />
                    <span className="line-clamp-1">{transfer.senderName}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    <MemberAvatar userId={transfer.receiverId} username={transfer.receiverName} className="w-6 h-6" />
                    <span className="line-clamp-1">{transfer.receiverName}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <ActivityItemMenu
                    onEdit={() => onEditTransfer(transfer)}
                    onDelete={() => onDeleteTransfer(transfer)}
                  />
                </TableCell>
              </TableRow>
            );
          }
        })}
      </TableBody>
    </Table>
  );
}
