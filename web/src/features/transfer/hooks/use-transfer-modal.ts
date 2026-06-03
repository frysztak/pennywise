import { useState } from "react";

import type { GetGroupActivityResponse_ActivityItem_Transfer } from "@/gen/api/v1/group_pb";

export interface TransferTemplateDefaults {
  senderId?: string;
  receiverId?: string;
  amount?: number;
  currency?: string;
}

export function useTransferModal() {
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    transfer?: GetGroupActivityResponse_ActivityItem_Transfer;
    templateDefaults?: TransferTemplateDefaults;
  }>({
    open: false,
    mode: "create",
    transfer: undefined,
    templateDefaults: undefined,
  });

  const openCreate = (templateDefaults?: TransferTemplateDefaults) => {
    setModalState({ open: true, mode: "create", transfer: undefined, templateDefaults });
  };

  const openEdit = (transfer: GetGroupActivityResponse_ActivityItem_Transfer) => {
    setModalState({ open: true, mode: "edit", transfer, templateDefaults: undefined });
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
