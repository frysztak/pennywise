import { useState } from "react";
import type { GetGroupActivityResponse_ActivityItem_Expense } from "@/gen/api/v1/group_pb";

export function useExpenseModal() {
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    expense?: GetGroupActivityResponse_ActivityItem_Expense;
  }>({
    open: false,
    mode: "create",
    expense: undefined,
  });

  const openCreate = () => {
    setModalState({ open: true, mode: "create", expense: undefined });
  };

  const openEdit = (expense: GetGroupActivityResponse_ActivityItem_Expense) => {
    setModalState({ open: true, mode: "edit", expense });
  };

  const close = () => {
    setModalState((prev) => ({ ...prev, open: false }));
  };

  return {
    modalState,
    openCreate,
    openEdit,
    close,
  };
}
