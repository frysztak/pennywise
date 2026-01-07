import { useState } from "react";

import type { GetGroupActivityResponse_ActivityItem_Transfer } from "@/gen/api/v1/group_pb";

export function useTransferModal() {
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    transfer?: GetGroupActivityResponse_ActivityItem_Transfer;
  }>({
    open: false,
    mode: "create",
    transfer: undefined,
  });

  const openCreate = () => {
    setModalState({ open: true, mode: "create", transfer: undefined });
  };

  const openEdit = (transfer: GetGroupActivityResponse_ActivityItem_Transfer) => {
    setModalState({ open: true, mode: "edit", transfer });
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
