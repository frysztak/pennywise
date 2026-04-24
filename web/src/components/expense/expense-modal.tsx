import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { Controller, type DeepPartial, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { createExpense, updateExpense } from "@/gen/api/v1/expense-ExpenseService_connectquery";
import { getGroupActivity, getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import type { MemberBalance } from "@/gen/api/v1/group_pb";
import type { GetGroupActivityResponse_ActivityItem_Expense } from "@/gen/api/v1/group_pb";
import {
  getGroupRecurringExpenses,
  payRecurringExpense,
} from "@/gen/api/v1/recurring_expense-RecurringExpenseService_connectquery";
import type { ExpenseTemplateDefaults } from "@/hooks/use-expense-modal";
import { handleError } from "@/lib/utils";

import { AmountInput } from "../amount-input";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string(),
  amountWithCurrency: z.object({
    amount: z.number({ error: (_) => "Amount must be a number" }).positive("Amount must be a positive number"),
    currency: z.string().min(2, "Currency is required"),
  }),
  payerId: z.string().min(1, "Payer is required"),
  beneficiariesIds: z.array(z.string()).min(1, "At least one beneficiary is required"),
  date: z.iso.date("Invalid date format"),
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
  // Convert RFC3339 to YYYY-MM-DD for input[type="date"]
  return new Date(rfc3339).toISOString().split("T")[0];
};

type FormValues = z.infer<typeof formSchema>;

interface ExpenseModalProps {
  // Modal control
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // Mode specification
  mode: "create" | "edit";
  expense?: GetGroupActivityResponse_ActivityItem_Expense; // Required when mode='edit'
  templateDefaults?: ExpenseTemplateDefaults; // Optional template values for create mode
  recurringExpenseId?: string; // If creating from recurring expense template

  // Data dependencies
  groupId: string;
  groupMembers: MemberBalance[];
  currentUserId: string;
  defaultCurrency: string;
}

export const ExpenseModal = ({
  open,
  onOpenChange,
  mode,
  expense,
  templateDefaults,
  recurringExpenseId,
  groupId,
  groupMembers,
  currentUserId,
  defaultCurrency,
}: ExpenseModalProps) => {
  const isEditMode = mode === "edit";

  // Memoize default beneficiary IDs to prevent unnecessary re-renders
  const defaultBeneficiaryIds = useMemo(() => groupMembers.map((m) => m.userId), [groupMembers]);

  const payerSelectItems = groupMembers.map((m) => ({label: m.userName, value: m.userId}))

  // Helper function to get form defaults based on mode
  const getFormDefaults = useCallback((): DeepPartial<FormValues> => {
    if (isEditMode && expense) {
      return {
        name: expense.name,
        description: expense.description || "",
        amountWithCurrency: { amount: convertAmountToDisplay(expense.amount), currency: expense.currency },
        payerId: expense.payerId,
        beneficiariesIds: expense.beneficiariesIds,
        date: convertRFC3339ToDateString(timestampDate(expense.date!)),
      };
    }

    // Create mode: use template defaults if provided, otherwise use defaults
    return {
      name: templateDefaults?.name || "",
      description: templateDefaults?.description || "",
      amountWithCurrency: {
        amount: templateDefaults?.amount,
        currency: templateDefaults?.currency || defaultCurrency,
      },
      payerId: templateDefaults?.payerId || currentUserId,
      beneficiariesIds: defaultBeneficiaryIds,
      date: getTodayDateString(),
    };
  }, [isEditMode, expense, templateDefaults, defaultCurrency, currentUserId, defaultBeneficiaryIds]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: getFormDefaults(),
  });

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      form.reset(getFormDefaults());
    }
  }, [open, getFormDefaults, form]);

  const userGroupsKey = createConnectQueryKey({
    schema: getUserGroups,
    cardinality: "finite",
  });

  const groupActivityKey = createConnectQueryKey({
    schema: getGroupActivity,
    cardinality: "finite",
    input: { groupId },
  });

  const recurringExpensesKey = createConnectQueryKey({
    schema: getGroupRecurringExpenses,
    cardinality: "finite",
    input: { groupId },
  });

  const queryClient = useQueryClient();

  const { isPending: isCreating, mutate: createMutate } = useMutation(createExpense, {
    onSuccess: () => {
      toast.success("Expense created!");
      queryClient.invalidateQueries({ queryKey: groupActivityKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      onOpenChange(false);
    },
    onError: handleError,
  });

  const { isPending: isUpdating, mutate: updateMutate } = useMutation(updateExpense, {
    onSuccess: () => {
      toast.success("Expense updated!");
      queryClient.invalidateQueries({ queryKey: groupActivityKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      onOpenChange(false);
    },
    onError: handleError,
  });

  const { isPending: isPaying, mutate: payMutate } = useMutation(payRecurringExpense, {
    onSuccess: () => {
      toast.success("Expense recorded!");
      queryClient.invalidateQueries({ queryKey: groupActivityKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      queryClient.invalidateQueries({ queryKey: recurringExpensesKey });
      onOpenChange(false);
    },
    onError: handleError,
  });

  const isPending = isCreating || isUpdating || isPaying;

  const onSubmit = (data: FormValues) => {
    if (isEditMode && expense) {
      updateMutate({
        id: expense.id,
        payerId: data.payerId,
        name: data.name,
        description: data.description,
        amount: data.amountWithCurrency.amount,
        currency: data.amountWithCurrency.currency,
        beneficiariesIds: data.beneficiariesIds,
        date: timestampFromDate(new Date(data.date)),
      });
    } else if (recurringExpenseId) {
      // Creating from recurring expense template - use payRecurringExpense
      // Only pass overrides if they differ from template defaults
      payMutate({
        recurringExpenseId,
        date: timestampFromDate(new Date(data.date)),
        amount:
          data.amountWithCurrency.amount !== templateDefaults?.amount ? data.amountWithCurrency.amount : undefined,
        payerId: data.payerId !== templateDefaults?.payerId ? data.payerId : undefined,
      });
    } else {
      createMutate({
        groupId,
        payerId: data.payerId,
        name: data.name,
        description: data.description,
        amount: data.amountWithCurrency.amount,
        currency: data.amountWithCurrency.currency,
        beneficiariesIds: data.beneficiariesIds,
        date: timestampFromDate(new Date(data.date)),
      });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Clear form when closing
      form.reset();
    }
    onOpenChange(newOpen);
  };

  const beneficiariesIds = form.watch("beneficiariesIds");

  const handleBeneficiaryToggle = (userId: string, checked: boolean) => {
    const current = beneficiariesIds || [];
    if (checked) {
      form.setValue("beneficiariesIds", [...current, userId]);
    } else {
      form.setValue(
        "beneficiariesIds",
        current.filter((id) => id !== userId),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit expense" : "Add new expense"}</DialogTitle>
          <DialogDescription>
            {isEditMode ? "Update expense details." : "Create a new expense for this group."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="name"
              disabled={isPending}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="expenseName">Expense name</FieldLabel>
                  <Input
                    {...field}
                    id="expenseName"
                    placeholder="Dinner, groceries, etc."
                    required
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            {/* <Controller
              name="description"
              disabled={isPending}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="expenseDesc">Description (optional)</FieldLabel>
                  <Input
                    {...field}
                    id="expenseDesc"
                    placeholder="Additional details..."
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            /> */}

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
                    <FieldLabel htmlFor="expenseDate">Date</FieldLabel>
                    <Input {...field} id="expenseDate" type="date" required aria-invalid={fieldState.invalid} />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </div>
            <Controller
              name="payerId"
              disabled={isPending}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="payer">Paid by</FieldLabel>
                  <Select items={payerSelectItems} value={field.value} onValueChange={field.onChange} disabled={isPending}>
                    <SelectTrigger id="payer" aria-invalid={fieldState.invalid}>
                      <SelectValue placeholder="Select payer" />
                    </SelectTrigger>
                    <SelectContent>
                      {payerSelectItems.map((member) => (
                        <SelectItem key={member.value} value={member.value}>
                          {member.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Field>
              <FieldLabel>Split between</FieldLabel>
              <div className="space-y-3 mt-2">
                {groupMembers.map((member) => (
                  <div key={member.userId} className="flex items-center space-x-2">
                    <Checkbox
                      id={`beneficiary-${member.userId}`}
                      checked={beneficiariesIds?.includes(member.userId)}
                      onCheckedChange={(checked) => handleBeneficiaryToggle(member.userId, checked === true)}
                      disabled={isPending}
                    />
                    <Label htmlFor={`beneficiary-${member.userId}`} className="text-sm font-normal cursor-pointer">
                      {member.userName}
                    </Label>
                  </div>
                ))}
              </div>
              {form.formState.errors.beneficiariesIds && (
                <FieldError errors={[form.formState.errors.beneficiariesIds]} />
              )}
            </Field>
            <Field>
              <Button type="submit" disabled={isPending}>
                {isPending && <Spinner />}
                {isEditMode ? "Update Expense" : "Create Expense"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
};
