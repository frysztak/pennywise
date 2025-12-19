import { useState } from "react";
import type { GetGroupTransfersResponse_Transfer } from "@/gen/api/v1/transfer_pb";

export function useTransferModal() {
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    transfer?: GetGroupTransfersResponse_Transfer;
  }>({
    open: false,
    mode: "create",
    transfer: undefined,
  });

  const openCreate = () => {
    setModalState({ open: true, mode: "create", transfer: undefined });
  };

  const openEdit = (transfer: GetGroupTransfersResponse_Transfer) => {
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
