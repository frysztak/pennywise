import { useState } from "react";

import type { GetGroupActivityResponse_ActivityItem_Conversion } from "@/gen/api/v1/group_pb";

export interface ConversionTemplateDefaults {
  fromCurrency?: string;
  toCurrency?: string;
  rate?: number;
}

export function useConversionModal() {
  const [modalState, setModalState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    conversion?: GetGroupActivityResponse_ActivityItem_Conversion;
    templateDefaults?: ConversionTemplateDefaults;
  }>({
    open: false,
    mode: "create",
    conversion: undefined,
    templateDefaults: undefined,
  });

  const openCreate = (templateDefaults?: ConversionTemplateDefaults) => {
    setModalState({ open: true, mode: "create", conversion: undefined, templateDefaults });
  };

  const openEdit = (conversion: GetGroupActivityResponse_ActivityItem_Conversion) => {
    setModalState({ open: true, mode: "edit", conversion, templateDefaults: undefined });
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
