import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AmountWithCurrency } from "@/components/amount-with-currency";
import {
  MoreHorizontal,
  Pencil,
  Trash,
  ArrowRight,
  Redo2Icon,
  BanknoteIcon,
} from "lucide-react";
import type { GetGroupExpensesResponse_Expense } from "@/gen/api/v1/expense_pb";
import type { GetGroupTransfersResponse_Transfer } from "@/gen/api/v1/transfer_pb";

type ActivityItem =
  | { type: "expense"; data: GetGroupExpensesResponse_Expense; date: Date }
  | { type: "transfer"; data: GetGroupTransfersResponse_Transfer; date: Date };

interface ActivityTableProps {
  recentActivity: ActivityItem[];
  onEditExpense: (expense: GetGroupExpensesResponse_Expense) => void;
  onDeleteExpense: (expense: GetGroupExpensesResponse_Expense) => void;
  onEditTransfer: (transfer: GetGroupTransfersResponse_Transfer) => void;
  onDeleteTransfer: (transfer: GetGroupTransfersResponse_Transfer) => void;
}

export function ActivityTable({
  recentActivity,
  onEditExpense,
  onDeleteExpense,
  onEditTransfer,
  onDeleteTransfer,
}: ActivityTableProps) {
  if (recentActivity.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-muted-foreground">No activity yet in this group.</p>
        </CardContent>
      </Card>
    );
  }

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
          const formattedDate = item.date.toLocaleDateString("en-US", {
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
                  <AmountWithCurrency
                    disableColor
                    className="text-right"
                    balance={[expense]}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                      <span className="text-xs">
                        {expense.payerName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm truncate max-w-[150px]">
                      paid by {expense.payerName}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEditExpense(expense)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDeleteExpense(expense)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                  <div className="flex items-center gap-1 text-sm">
                    <span className="truncate max-w-[80px]">
                      {transfer.senderName}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate max-w-[80px]">
                      {transfer.receiverName}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEditTransfer(transfer)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDeleteTransfer(transfer)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          }
        })}
      </TableBody>
    </Table>
  );
}
