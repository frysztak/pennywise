import { DataTable } from "@/components/ui/data-table";
import { type ActivityItem, makeActivityColumns } from "@/components/group/activity-columns";
import type {
  GetGroupActivityResponse_ActivityItem_Expense,
  GetGroupActivityResponse_ActivityItem_Transfer,
} from "@/gen/api/v1/group_pb";

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
  const columns = makeActivityColumns({ onEditExpense, onDeleteExpense, onEditTransfer, onDeleteTransfer });

  return (
    <DataTable
      columns={columns}
      data={recentActivity}
      emptyMessage="No activity yet in this group."
    />
  );
}
