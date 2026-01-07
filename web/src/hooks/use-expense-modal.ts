import { useState } from "react";
import type { GetGroupActivityResponse_ActivityItem_Expense } from "@/gen/api/v1/group_pb";

export interface ExpenseTemplateDefaults {
  name?: string;
  description?: string;
  amount?: number;
  currency?: string;
  payerId?: string;
}

export function useExpenseModal() {
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    expense?: GetGroupActivityResponse_ActivityItem_Expense;
    templateDefaults?: ExpenseTemplateDefaults;
    recurringExpenseId?: string; // Track if this is from a recurring expense
  }>({
    open: false,
    mode: "create",
    expense: undefined,
    templateDefaults: undefined,
    recurringExpenseId: undefined,
  });

  const openCreate = (
    templateDefaults?: ExpenseTemplateDefaults,
    recurringExpenseId?: string
  ) => {
    setModalState({
      open: true,
      mode: "create",
      expense: undefined,
      templateDefaults,
      recurringExpenseId,
    });
  };

  const openEdit = (expense: GetGroupActivityResponse_ActivityItem_Expense) => {
    setModalState({
      open: true,
      mode: "edit",
      expense,
      templateDefaults: undefined,
    });
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
