import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import type { MemberBalance } from "@/gen/api/v1/group_pb";
import {
  createRecurringExpense,
  getGroupRecurringExpenses,
  updateRecurringExpense,
} from "@/gen/api/v1/recurring_expense-RecurringExpenseService_connectquery";
import type { GetGroupRecurringExpensesResponse_RecurringExpense } from "@/gen/api/v1/recurring_expense_pb";
import { RecurringFrequency } from "@/gen/api/v1/recurring_expense_pb";
import { COMMON_CURRENCIES } from "@/lib/currencies";
import { handleError } from "@/lib/utils";

import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string(),
  frequency: z.nativeEnum(RecurringFrequency),
  startDate: z.string().date("Invalid date format"),
  amount: z.number().positive("Amount must be positive").optional(),
  currency: z.string().min(2).optional(),
  payerId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface RecurringExpenseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  groupId: string;
  groupMembers: MemberBalance[];
  currentUserId: string;
  defaultCurrency: string;
  recurringExpense?: GetGroupRecurringExpensesResponse_RecurringExpense;
}

export const RecurringExpenseModal = ({
  open,
  onOpenChange,
  mode,
  groupId,
  groupMembers,
  currentUserId,
  defaultCurrency,
  recurringExpense,
}: RecurringExpenseModalProps) => {
  const isEditMode = mode === "edit";

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      frequency: RecurringFrequency.MONTHLY,
      startDate: new Date().toISOString().split("T")[0],
      amount: undefined,
      currency: defaultCurrency,
      payerId: currentUserId,
    },
  });

  useEffect(() => {
    if (open && isEditMode && recurringExpense) {
      form.reset({
        name: recurringExpense.name,
        description: recurringExpense.description || "",
        frequency: recurringExpense.frequency,
        startDate: timestampDate(recurringExpense.startDate!).toISOString().split("T")[0],
        amount: recurringExpense.amount,
        currency: recurringExpense.currency || defaultCurrency,
        payerId: recurringExpense.payerId || currentUserId,
      });
    } else if (open && !isEditMode) {
      form.reset({
        name: "",
        description: "",
        frequency: RecurringFrequency.MONTHLY,
        startDate: new Date().toISOString().split("T")[0],
        amount: undefined,
        currency: defaultCurrency,
        payerId: currentUserId,
      });
    }
  }, [open, isEditMode, recurringExpense, form, defaultCurrency, currentUserId]);

  const queryClient = useQueryClient();
  const recurringExpensesKey = createConnectQueryKey({
    schema: getGroupRecurringExpenses,
    cardinality: "finite",
    input: { groupId },
  });

  const { isPending: isCreating, mutate: createMutate } = useMutation(createRecurringExpense, {
    onSuccess: () => {
      toast.success("Recurring expense created!");
      queryClient.invalidateQueries({ queryKey: recurringExpensesKey });
      onOpenChange(false);
    },
    onError: handleError,
  });

  const { isPending: isUpdating, mutate: updateMutate } = useMutation(updateRecurringExpense, {
    onSuccess: () => {
      toast.success("Recurring expense updated!");
      queryClient.invalidateQueries({ queryKey: recurringExpensesKey });
      onOpenChange(false);
    },
    onError: handleError,
  });

  const isPending = isCreating || isUpdating;

  const onSubmit = (data: FormValues) => {
    if (isEditMode && recurringExpense) {
      updateMutate({
        id: recurringExpense.id,
        name: data.name,
        description: data.description,
        frequency: data.frequency,
        amount: data.amount,
        currency: data.currency,
        payerId: data.payerId,
      });
    } else {
      createMutate({
        groupId,
        name: data.name,
        description: data.description,
        frequency: data.frequency,
        startDate: timestampFromDate(new Date(data.startDate)),
        amount: data.amount,
        currency: data.currency,
        payerId: data.payerId,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Recurring Expense" : "Create Recurring Expense"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the recurring expense template."
              : "Create a template that will remind you to record expenses."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              disabled={isPending}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <Input {...field} placeholder="e.g., Monthly Rent" required />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="description"
              control={form.control}
              disabled={isPending}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>Description (optional)</FieldLabel>
                  <Input {...field} placeholder="Additional details..." />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="frequency"
              control={form.control}
              disabled={isPending}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>Frequency</FieldLabel>
                  <Select
                    value={field.value.toString()}
                    onValueChange={(value) => field.onChange(parseInt(value))}
                    disabled={isPending}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={RecurringFrequency.DAILY.toString()}>Daily</SelectItem>
                      <SelectItem value={RecurringFrequency.WEEKLY.toString()}>Weekly</SelectItem>
                      <SelectItem value={RecurringFrequency.MONTHLY.toString()}>Monthly</SelectItem>
                      <SelectItem value={RecurringFrequency.YEARLY.toString()}>Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            {!isEditMode && (
              <Controller
                name="startDate"
                control={form.control}
                disabled={isPending}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>Start Date</FieldLabel>
                    <Input {...field} type="date" required />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              <Controller
                name="amount"
                control={form.control}
                disabled={isPending}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>Amount (optional)</FieldLabel>
                    <Input
                      {...field}
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      onChange={(e) => field.onChange(e.target.value ? e.target.valueAsNumber : undefined)}
                      value={field.value ?? ""}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />

              <Controller
                name="currency"
                control={form.control}
                disabled={isPending}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>Currency</FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                      <SelectTrigger>
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

            <Controller
              name="payerId"
              control={form.control}
              disabled={isPending}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>Default Payer (optional)</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isPending}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payer" />
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

            <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
              Expense will be split equally among all group members
            </div>

            <Field>
              <Button type="submit" disabled={isPending}>
                {isPending && <Spinner />}
                {isEditMode ? "Update Template" : "Create Template"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
};
