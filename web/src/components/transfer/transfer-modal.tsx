import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import {
  getGroupActivity,
  getSettlementSuggestions,
  getUserGroups,
} from "@/gen/api/v1/group-GroupService_connectquery";
import type { GetGroupActivityResponse_ActivityItem_Transfer, MemberBalance } from "@/gen/api/v1/group_pb";
import { createTransfer, updateTransfer } from "@/gen/api/v1/transfer-TransferService_connectquery";
import type { TransferTemplateDefaults } from "@/hooks/use-transfer-modal";
import { handleError } from "@/lib/utils";

import { AmountInput } from "../amount-input";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { TransferFlow } from "./transfer-flow";

const formSchema = z
  .object({
    senderId: z.string().min(1, "Sender is required"),
    receiverId: z.string().min(1, "Receiver is required"),
    amountWithCurrency: z.object({
      amount: z.number({ error: (_) => "Amount must be a number" }).positive("Amount must be a positive number"),
      currency: z.string().min(2, "Currency is required"),
    }),
    date: z.string().date("Invalid date format"),
  })
  .refine((data) => data.senderId !== data.receiverId, {
    message: "Sender and receiver must be different",
    path: ["receiverId"],
  });

// Helper functions for amount conversion
const convertAmountToDisplay = (amount: bigint | number): number => {
  return Number(amount) / 100;
};

// Helper functions for date conversion
const getTodayDateString = (): string => {
  return new Date().toISOString().split("T")[0];
};

const convertRFC3339ToDateString = (rfc3339: string | Date): string => {
  return new Date(rfc3339).toISOString().split("T")[0];
};

type FormValues = z.infer<typeof formSchema>;

interface TransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  transfer?: GetGroupActivityResponse_ActivityItem_Transfer;
  templateDefaults?: TransferTemplateDefaults;
  groupId: string;
  groupMembers: MemberBalance[];
  currentUserId: string;
  defaultCurrency: string;
  currencies: string[];
}

const userGroupsKey = createConnectQueryKey({
  schema: getUserGroups,
  cardinality: "finite",
});
const settlementSuggestionsKey = createConnectQueryKey({
  schema: getSettlementSuggestions,
  cardinality: "finite",
});

export const TransferModal = ({
  open,
  onOpenChange,
  mode,
  transfer,
  templateDefaults,
  groupId,
  groupMembers,
  currentUserId,
  defaultCurrency,
  currencies,
}: TransferModalProps) => {
  const isEditMode = mode === "edit";

  const getFormDefaults = useCallback((): FormValues => {
    if (isEditMode && transfer) {
      return {
        senderId: transfer.senderId,
        receiverId: transfer.receiverId,
        amountWithCurrency: {
          amount: convertAmountToDisplay(transfer.amount),
          currency: transfer.currency,
        },
        date: convertRFC3339ToDateString(timestampDate(transfer.date!)),
      };
    }

    return {
      senderId: templateDefaults?.senderId ?? currentUserId,
      receiverId: templateDefaults?.receiverId ?? "",
      amountWithCurrency: {
        amount: templateDefaults?.amount ?? 0,
        currency: templateDefaults?.currency ?? defaultCurrency,
      },
      date: getTodayDateString(),
    };
  }, [isEditMode, transfer, templateDefaults, defaultCurrency, currentUserId]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getFormDefaults(),
  });

  useEffect(() => {
    if (open) {
      form.reset(getFormDefaults());
    }
  }, [open, getFormDefaults, form]);

  const groupActivityKey = createConnectQueryKey({
    schema: getGroupActivity,
    cardinality: "finite",
    input: { groupId },
  });

  const queryClient = useQueryClient();

  const { isPending: isCreating, mutate: createMutate } = useMutation(createTransfer, {
    onSuccess: () => {
      toast.success("Transfer recorded!");
      queryClient.invalidateQueries({ queryKey: groupActivityKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      queryClient.invalidateQueries({ queryKey: settlementSuggestionsKey });
      onOpenChange(false);
    },
    onError: handleError,
  });

  const { isPending: isUpdating, mutate: updateMutate } = useMutation(updateTransfer, {
    onSuccess: () => {
      toast.success("Transfer updated!");
      queryClient.invalidateQueries({ queryKey: groupActivityKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      queryClient.invalidateQueries({ queryKey: settlementSuggestionsKey });
      onOpenChange(false);
    },
    onError: handleError,
  });

  const isPending = isCreating || isUpdating;

  const senderId = form.watch("senderId");
  const receiverId = form.watch("receiverId");
  const senderError = form.formState.errors.senderId;
  const receiverError = form.formState.errors.receiverId;
  const partyError = receiverError ?? senderError;

  const onSubmit = (data: FormValues) => {
    if (isEditMode && transfer) {
      updateMutate({
        id: transfer.id,
        senderId: data.senderId,
        receiverId: data.receiverId,
        amount: data.amountWithCurrency.amount,
        currency: data.amountWithCurrency.currency,
        date: timestampFromDate(new Date(data.date)),
      });
    } else {
      createMutate({
        groupId,
        senderId: data.senderId,
        receiverId: data.receiverId,
        amount: data.amountWithCurrency.amount,
        currency: data.amountWithCurrency.currency,
        date: timestampFromDate(new Date(data.date)),
      });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit transfer" : "Record transfer"}</DialogTitle>
          <DialogDescription>
            {isEditMode ? "Update transfer details." : "Record a payment between group members."}
          </DialogDescription>
        </DialogHeader>
        <form id="transfer-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Field>
              <FieldLabel>Transfer</FieldLabel>
              <TransferFlow
                members={groupMembers}
                senderId={senderId}
                receiverId={receiverId}
                currentUserId={currentUserId}
                disabled={isPending}
                invalid={!!partyError}
                onSenderChange={(id) => form.setValue("senderId", id, { shouldValidate: true, shouldDirty: true })}
                onReceiverChange={(id) => form.setValue("receiverId", id, { shouldValidate: true, shouldDirty: true })}
              />
              {partyError && <FieldError errors={[partyError]} />}
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Controller
                name="amountWithCurrency"
                disabled={isPending}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor="amountWithCurrency">Amount</FieldLabel>
                    <AmountInput
                      id="amountWithCurrency"
                      required
                      currencies={currencies}
                      inputValue={field.value}
                      disabled={field.disabled}
                      onValueChange={field.onChange}
                      invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[(fieldState.error as any)?.amount || (fieldState.error as any)?.currency]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                name="date"
                disabled={isPending}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor="transferDate">Date</FieldLabel>
                    <Input {...field} id="transferDate" type="date" required aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Field>
            <Button type="submit" form="transfer-form" disabled={isPending} size="lg">
              {isPending && <Spinner />}
              {isEditMode ? "Update Transfer" : "Record Transfer"}
            </Button>
          </Field>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
