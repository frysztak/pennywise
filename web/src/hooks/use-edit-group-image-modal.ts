import { useState } from "react";

export function useEditGroupImageModal() {
  const [groupId, setGroupId] = useState<string | null>(null);

  const openModal = (id: string) => setGroupId(id);

  const handleOpenChange = (open: boolean) => {
    if (!open) setGroupId(null);
  };

  return {
    openModal,
    dialogProps: {
      open: !!groupId,
      groupId,
      onOpenChange: handleOpenChange,
    },
  };
}
