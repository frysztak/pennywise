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

interface DeleteConversionDialogProps {
  open: boolean;
  fromCurrency?: string;
  toCurrency?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteConversionDialog({
  open,
  fromCurrency,
  toCurrency,
  onOpenChange,
  onConfirm,
}: DeleteConversionDialogProps) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("conversion.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("conversion.delete.description", { from: fromCurrency, to: toCurrency })}
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
