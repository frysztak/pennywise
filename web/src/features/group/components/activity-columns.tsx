import { timestampDate } from "@bufbuild/protobuf/wkt";
import { type ColumnDef } from "@tanstack/react-table";
import type { TFunction } from "i18next";
import { ArrowRight, BanknoteIcon, Redo2Icon, RefreshCw } from "lucide-react";

import { ActivityItemMenu } from "@/features/group/components/activity-item-menu";
import type {
  GetGroupActivityResponse_ActivityItem_Conversion,
  GetGroupActivityResponse_ActivityItem_Expense,
  GetGroupActivityResponse_ActivityItem_Transfer,
} from "@/gen/api/v1/group_pb";
import { AmountWithCurrency } from "@/shared/components/amount-with-currency";
import { MemberAvatar } from "@/shared/components/member-avatar";
import { formatDate } from "@/shared/lib/format";

export type ActivityItem =
  | { type: "expense"; data: GetGroupActivityResponse_ActivityItem_Expense }
  | { type: "transfer"; data: GetGroupActivityResponse_ActivityItem_Transfer }
  | { type: "conversion"; data: GetGroupActivityResponse_ActivityItem_Conversion };

interface ActivityCallbacks {
  onEditExpense: (expense: GetGroupActivityResponse_ActivityItem_Expense) => void;
  onDeleteExpense: (expense: GetGroupActivityResponse_ActivityItem_Expense) => void;
  onEditTransfer: (transfer: GetGroupActivityResponse_ActivityItem_Transfer) => void;
  onDeleteTransfer: (transfer: GetGroupActivityResponse_ActivityItem_Transfer) => void;
  onEditConversion: (conversion: GetGroupActivityResponse_ActivityItem_Conversion) => void;
  onDeleteConversion: (conversion: GetGroupActivityResponse_ActivityItem_Conversion) => void;
}

export function makeActivityColumns(
  callbacks: ActivityCallbacks,
  t: TFunction,
  isArchived = false,
): ColumnDef<ActivityItem>[] {
  const columns: ColumnDef<ActivityItem>[] = [
    {
      id: "date",
      header: t("activity.date"),
      cell: ({ row }) => {
        const date = timestampDate(row.original.data.date!);
        return <span className="text-sm">{formatDate(date)}</span>;
      },
    },
    {
      id: "description",
      header: t("activity.description"),
      cell: ({ row }) => {
        const item = row.original;
        if (item.type === "conversion") {
          return (
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              <span>
                {item.data.fromCurrency} → {item.data.toCurrency}
              </span>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2">
            {item.type === "expense" ? <BanknoteIcon className="h-4 w-4" /> : <Redo2Icon className="h-4 w-4" />}
            <span>{item.type === "expense" ? item.data.name : t("activity.transfer")}</span>
          </div>
        );
      },
    },
    {
      id: "amount",
      header: () => <span className="block">{t("activity.amount")}</span>,
      cell: ({ row }) => {
        const item = row.original;
        if (item.type === "conversion") {
          // Conversions have no monetary amount; the rate is shown in the details column.
          return <span className="text-muted-foreground">-</span>;
        }
        const balance =
          item.type === "expense" ? [item.data] : [{ amount: item.data.amount, currency: item.data.currency }];
        return <AmountWithCurrency disableColor balance={balance} />;
      },
    },
    {
      id: "details",
      header: t("activity.details"),
      cell: ({ row }) => {
        const item = row.original;
        if (item.type === "expense") {
          return (
            <div className="flex items-center gap-2">
              <MemberAvatar userId={item.data.payerId} username={item.data.payerName} className="w-6 h-6" />
              <span className="text-sm line-clamp-1">{t("activity.paidBy", { name: item.data.payerName })}</span>
            </div>
          );
        }
        if (item.type === "conversion") {
          return (
            <span className="text-sm text-muted-foreground line-clamp-1">
              {t("conversion.rateHint", {
                from: item.data.fromCurrency,
                to: item.data.toCurrency,
                rate: item.data.rate,
              })}
            </span>
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
  ];

  if (!isArchived) {
    columns.push({
      id: "actions",
      header: () => <span className="block">{t("activity.actions")}</span>,
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
        if (item.type === "conversion") {
          return (
            <ActivityItemMenu
              onEdit={() => callbacks.onEditConversion(item.data)}
              onDelete={() => callbacks.onDeleteConversion(item.data)}
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
    });
  }

  return columns;
}
