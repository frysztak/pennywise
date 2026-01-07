import { useState } from "react";
import type { GetGroupRecurringExpensesResponse_RecurringExpense } from "@/gen/api/v1/recurring_expense_pb";

export function useRecurringExpenseModal() {
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    recurringExpense?: GetGroupRecurringExpensesResponse_RecurringExpense;
  }>({
    open: false,
    mode: "create",
    recurringExpense: undefined,
  });

  const openCreate = () => {
    setModalState({ open: true, mode: "create", recurringExpense: undefined });
  };

  const openEdit = (recurringExpense: GetGroupRecurringExpensesResponse_RecurringExpense) => {
    setModalState({ open: true, mode: "edit", recurringExpense });
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
