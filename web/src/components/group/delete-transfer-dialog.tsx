import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete transfer</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this transfer from {senderName} to{" "}
            {receiverName}? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
