import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";

interface DeleteTransferDialogProps {
  open: boolean;
  senderName?: string;
  receiverName?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteTransferDialog({
  open,
  senderName,
  receiverName,
  onOpenChange,
  onConfirm,
}: DeleteTransferDialogProps) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("transfer.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("transfer.delete.description", { sender: senderName, receiver: receiverName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
