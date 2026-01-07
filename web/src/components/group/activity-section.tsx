import { useSuspenseQuery } from "@connectrpc/connect-query";

import { ActivityTable } from "@/components/group/activity-table";
import { getGroupActivity } from "@/gen/api/v1/group-GroupService_connectquery";
import type { useDeleteExpenseModal } from "@/hooks/use-delete-expense-modal";
import type { useDeleteTransferModal } from "@/hooks/use-delete-transfer-modal";
import type { useExpenseModal } from "@/hooks/use-expense-modal";
import type { useTransferModal } from "@/hooks/use-transfer-modal";

interface ActivitySectionProps {
  groupId: string;
  onEditExpense: ReturnType<typeof useExpenseModal>["openEdit"];
  onDeleteExpense: ReturnType<typeof useDeleteExpenseModal>["confirmDelete"];
  onEditTransfer: ReturnType<typeof useTransferModal>["openEdit"];
  onDeleteTransfer: ReturnType<typeof useDeleteTransferModal>["confirmDelete"];
}

export function ActivitySection({
  groupId,
  onEditExpense,
  onDeleteExpense,
  onEditTransfer,
  onDeleteTransfer,
}: ActivitySectionProps) {
  const { data: activityData } = useSuspenseQuery(getGroupActivity, {
    groupId,
  });

  // Transform backend activity items into format expected by ActivityTable
  const recentActivity = activityData.items.map((item) => {
    if (item.data.case === "expense") {
      return {
        type: "expense" as const,
        data: item.data.value,
      };
    } else if (item.data.case === "transfer") {
      return {
        type: "transfer" as const,
        data: item.data.value,
      };
    }
    throw new Error("Unknown activity item type");
  });

  return (
    <ActivityTable
      recentActivity={recentActivity}
      onEditExpense={onEditExpense}
      onDeleteExpense={onDeleteExpense}
      onEditTransfer={onEditTransfer}
      onDeleteTransfer={onDeleteTransfer}
    />
  );
}
