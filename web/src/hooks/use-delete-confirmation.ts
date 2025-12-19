import { useState } from "react";

export function useDeleteConfirmation<T>() {
  const [deletingItem, setDeletingItem] = useState<T | null>(null);

  const confirmDelete = (item: T) => {
    setDeletingItem(item);
  };

  const cancelDelete = () => {
    setDeletingItem(null);
  };

  const handleConfirm = (onDelete: (item: T) => void) => {
    if (deletingItem) {
      onDelete(deletingItem);
    }
  };

  return {
    deletingItem,
    confirmDelete,
    cancelDelete,
    handleConfirm,
  };
}
