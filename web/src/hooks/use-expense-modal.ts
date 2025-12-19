import { useState } from "react";
import type { GetGroupExpensesResponse_Expense } from "@/gen/api/v1/expense_pb";

export function useExpenseModal() {
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    expense?: GetGroupExpensesResponse_Expense;
  }>({
    open: false,
    mode: "create",
    expense: undefined,
  });

  const openCreate = () => {
    setModalState({ open: true, mode: "create", expense: undefined });
  };

  const openEdit = (expense: GetGroupExpensesResponse_Expense) => {
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
