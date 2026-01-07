import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { getGroupActivity, getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import type { GetGroupActivityResponse_ActivityItem_Transfer, MemberBalance } from "@/gen/api/v1/group_pb";
import { createTransfer, updateTransfer } from "@/gen/api/v1/transfer-TransferService_connectquery";
import { COMMON_CURRENCIES } from "@/lib/currencies";
import { handleError } from "@/lib/utils";

import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";

const formSchema = z
  .object({
    senderId: z.string().min(1, "Sender is required"),
    receiverId: z.string().min(1, "Receiver is required"),
    amount: z.number().positive("Amount must be a positive number"),
    currency: z.string().min(2, "Currency is required"),
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
  groupId: string;
  groupMembers: MemberBalance[];
  currentUserId: string;
  defaultCurrency: string;
}

export const TransferModal = ({
  open,
  onOpenChange,
  mode,
  transfer,
  groupId,
  groupMembers,
  currentUserId,
  defaultCurrency,
}: TransferModalProps) => {
  const isEditMode = mode === "edit";

  const getFormDefaults = useCallback((): FormValues => {
    if (isEditMode && transfer) {
      return {
        senderId: transfer.senderId,
        receiverId: transfer.receiverId,
        amount: convertAmountToDisplay(transfer.amount),
        currency: transfer.currency,
        date: convertRFC3339ToDateString(timestampDate(transfer.date!)),
      };
    }

    return {
      senderId: currentUserId,
      receiverId: "",
      amount: 0,
      currency: defaultCurrency,
      date: getTodayDateString(),
    };
  }, [isEditMode, transfer, defaultCurrency, currentUserId]);

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

  const userGroupsKey = createConnectQueryKey({
    schema: getUserGroups,
    cardinality: "finite",
  });

  const queryClient = useQueryClient();

  const { isPending: isCreating, mutate: createMutate } = useMutation(createTransfer, {
    onSuccess: () => {
      toast.success("Transfer recorded!");
      queryClient.invalidateQueries({ queryKey: groupActivityKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      onOpenChange(false);
    },
    onError: handleError,
  });

  const { isPending: isUpdating, mutate: updateMutate } = useMutation(updateTransfer, {
    onSuccess: () => {
      toast.success("Transfer updated!");
      queryClient.invalidateQueries({ queryKey: groupActivityKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      onOpenChange(false);
    },
    onError: handleError,
  });

  const isPending = isCreating || isUpdating;

  const onSubmit = (data: FormValues) => {
    if (isEditMode && transfer) {
      updateMutate({
        id: transfer.id,
        senderId: data.senderId,
        receiverId: data.receiverId,
        amount: data.amount,
        currency: data.currency,
        date: timestampFromDate(new Date(data.date)),
      });
    } else {
      createMutate({
        groupId,
        senderId: data.senderId,
        receiverId: data.receiverId,
        amount: data.amount,
        currency: data.currency,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit transfer" : "Record transfer"}</DialogTitle>
          <DialogDescription>
            {isEditMode ? "Update transfer details." : "Record a payment between group members."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="senderId"
              disabled={isPending}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="sender">From (sender)</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                    <SelectTrigger id="sender" aria-invalid={fieldState.invalid}>
                      <SelectValue placeholder="Select sender" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupMembers.map((member) => (
                        <SelectItem key={member.userId} value={member.userId}>
                          {member.userName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="receiverId"
              disabled={isPending}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="receiver">To (receiver)</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                    <SelectTrigger id="receiver" aria-invalid={fieldState.invalid}>
                      <SelectValue placeholder="Select receiver" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupMembers.map((member) => (
                        <SelectItem key={member.userId} value={member.userId}>
                          {member.userName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
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
            <div className="grid grid-cols-2 gap-4">
              <Controller
                name="amount"
                disabled={isPending}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor="amount">Amount</FieldLabel>
                    <Input
                      {...field}
                      id="amount"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      required
                      aria-invalid={fieldState.invalid}
                      onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="currency"
                disabled={isPending}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor="currency">Currency</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                      <SelectTrigger id="currency" aria-invalid={fieldState.invalid}>
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMON_CURRENCIES.map((currency) => (
                          <SelectItem key={currency.value} value={currency.value}>
                            {currency.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>
            <Field>
              <Button type="submit" disabled={isPending}>
                {isPending && <Spinner />}
                {isEditMode ? "Update Transfer" : "Record Transfer"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
};
