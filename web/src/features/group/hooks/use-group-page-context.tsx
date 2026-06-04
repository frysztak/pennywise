import { type ReactNode, createContext, use } from "react";

import type { useDeleteExpenseModal } from "@/features/expense/hooks/use-delete-expense-modal";
import type { useExpenseModal } from "@/features/expense/hooks/use-expense-modal";
import type { useDeleteGroupModal } from "@/features/group/hooks/use-delete-group-modal";
import type { useDeleteRecurringExpenseModal } from "@/features/recurring-expense/hooks/use-delete-recurring-expense-modal";
import type { useRecurringExpenseModal } from "@/features/recurring-expense/hooks/use-recurring-expense-modal";
import type { useDeleteTransferModal } from "@/features/transfer/hooks/use-delete-transfer-modal";
import type { useTransferModal } from "@/features/transfer/hooks/use-transfer-modal";
import type { UserGroup } from "@/gen/api/v1/group_pb";

export interface GroupPageContextValue {
  groupId: string;
  groupInfo: UserGroup;
  currentUserId: string;
  expenseModal: ReturnType<typeof useExpenseModal>;
  transferModal: ReturnType<typeof useTransferModal>;
  recurringExpenseModal: ReturnType<typeof useRecurringExpenseModal>;
  deleteExpenseModal: ReturnType<typeof useDeleteExpenseModal>;
  deleteTransferModal: ReturnType<typeof useDeleteTransferModal>;
  deleteRecurringExpenseModal: ReturnType<typeof useDeleteRecurringExpenseModal>;
  deleteGroupModal: ReturnType<typeof useDeleteGroupModal>;
}

const GroupPageContext = createContext<GroupPageContextValue | null>(null);

export function GroupPageProvider({ value, children }: { value: GroupPageContextValue; children: ReactNode }) {
  return <GroupPageContext value={value}>{children}</GroupPageContext>;
}

export function useGroupPageContext() {
  const ctx = use(GroupPageContext);
  if (!ctx) {
    throw new Error("useGroupPageContext must be used within a GroupPageProvider");
  }
  return ctx;
}
