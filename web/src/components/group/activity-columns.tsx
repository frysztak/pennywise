import { timestampDate } from "@bufbuild/protobuf/wkt";
import { type ColumnDef } from "@tanstack/react-table";
import { ArrowRight, BanknoteIcon, Redo2Icon } from "lucide-react";

import { AmountWithCurrency } from "@/components/amount-with-currency";
import { ActivityItemMenu } from "@/components/group/activity-item-menu";
import { MemberAvatar } from "@/components/member-avatar";
import type {
  GetGroupActivityResponse_ActivityItem_Expense,
  GetGroupActivityResponse_ActivityItem_Transfer,
} from "@/gen/api/v1/group_pb";

export type ActivityItem =
  | { type: "expense"; data: GetGroupActivityResponse_ActivityItem_Expense }
  | { type: "transfer"; data: GetGroupActivityResponse_ActivityItem_Transfer };

interface ActivityCallbacks {
  onEditExpense: (expense: GetGroupActivityResponse_ActivityItem_Expense) => void;
  onDeleteExpense: (expense: GetGroupActivityResponse_ActivityItem_Expense) => void;
  onEditTransfer: (transfer: GetGroupActivityResponse_ActivityItem_Transfer) => void;
  onDeleteTransfer: (transfer: GetGroupActivityResponse_ActivityItem_Transfer) => void;
}

export function makeActivityColumns(callbacks: ActivityCallbacks): ColumnDef<ActivityItem>[] {
  return [
    {
      id: "date",
      header: "Date",
      cell: ({ row }) => {
        const date = timestampDate(row.original.data.date!);
        return (
          <span className="text-sm">
            {date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        );
      },
    },
    {
      id: "description",
      header: "Description",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex items-center gap-2">
            {item.type === "expense" ? <BanknoteIcon className="h-4 w-4" /> : <Redo2Icon className="h-4 w-4" />}
            <span>{item.type === "expense" ? item.data.name : "Transfer"}</span>
          </div>
        );
      },
    },
    {
      id: "amount",
      header: () => <span className="block">Amount</span>,
      cell: ({ row }) => {
        const item = row.original;
        const balance =
          item.type === "expense" ? [item.data] : [{ amount: item.data.amount, currency: item.data.currency }];
        return <AmountWithCurrency disableColor balance={balance} />;
      },
    },
    {
      id: "details",
      header: "Details",
      cell: ({ row }) => {
        const item = row.original;
        if (item.type === "expense") {
          return (
            <div className="flex items-center gap-2">
              <MemberAvatar userId={item.data.payerId} username={item.data.payerName} className="w-6 h-6" />
              <span className="text-sm line-clamp-1">paid by {item.data.payerName}</span>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-1.5 text-sm">
            <MemberAvatar userId={item.data.senderId} username={item.data.senderName} className="w-6 h-6" />
            <span className="line-clamp-1">{item.data.senderName}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <MemberAvatar userId={item.data.receiverId} username={item.data.receiverName} className="w-6 h-6" />
            <span className="line-clamp-1">{item.data.receiverName}</span>
          </div>
        );
      },
    },
    {
      id: "actions",
      header: () => <span className="block">Actions</span>,
      cell: ({ row }) => {
        const item = row.original;
        if (item.type === "expense") {
          return (
            <ActivityItemMenu
              onEdit={() => callbacks.onEditExpense(item.data)}
              onDelete={() => callbacks.onDeleteExpense(item.data)}
            />
          );
        }
        return (
          <ActivityItemMenu
            onEdit={() => callbacks.onEditTransfer(item.data)}
            onDelete={() => callbacks.onDeleteTransfer(item.data)}
          />
        );
      },
    },
  ];
}
