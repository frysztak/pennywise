import { type ActivityItem, makeActivityColumns } from "@/features/group/components/activity-columns";
import type {
  GetGroupActivityResponse_ActivityItem_Expense,
  GetGroupActivityResponse_ActivityItem_Transfer,
} from "@/gen/api/v1/group_pb";
import { DataTable } from "@/shared/components/ui/data-table";

interface ActivityTableProps {
  recentActivity: ActivityItem[];
  onEditExpense: (expense: GetGroupActivityResponse_ActivityItem_Expense) => void;
  onDeleteExpense: (expense: GetGroupActivityResponse_ActivityItem_Expense) => void;
  onEditTransfer: (transfer: GetGroupActivityResponse_ActivityItem_Transfer) => void;
  onDeleteTransfer: (transfer: GetGroupActivityResponse_ActivityItem_Transfer) => void;
  isArchived?: boolean;
}

export function ActivityTable({
  recentActivity,
  onEditExpense,
  onDeleteExpense,
  onEditTransfer,
  onDeleteTransfer,
  isArchived,
}: ActivityTableProps) {
  const columns = makeActivityColumns({ onEditExpense, onDeleteExpense, onEditTransfer, onDeleteTransfer }, isArchived);

  return <DataTable columns={columns} data={recentActivity} emptyMessage="No activity yet in this group." />;
}
