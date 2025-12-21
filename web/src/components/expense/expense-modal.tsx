import { Controller, useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import {
  createExpense,
  updateExpense,
} from "@/gen/api/v1/expense-ExpenseService_connectquery";
import {
  getGroupActivity,
  getUserGroups,
} from "@/gen/api/v1/group-GroupService_connectquery";
import { Spinner } from "../ui/spinner";
import { toast } from "sonner";
import { useEffect, useMemo, useCallback } from "react";
import { handleError } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import type { MemberBalance } from "@/gen/api/v1/group_pb";
import type { GetGroupActivityResponse_ActivityItem_Expense } from "@/gen/api/v1/group_pb";
import { COMMON_CURRENCIES } from "@/lib/currencies";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string(),
  amount: z.number().positive("Amount must be a positive number"),
  currency: z.string().min(2, "Currency is required"),
  payerId: z.string().min(1, "Payer is required"),
  beneficiariesIds: z
    .array(z.string())
    .min(1, "At least one beneficiary is required"),
  date: z.string().date("Invalid date format"),
});

// Helper functions for amount conversion
const convertAmountToDisplay = (amount: bigint | number): number => {
  return Number(amount) / 100;
};

// Helper functions for date conversion
const getTodayDateString = (): string => {
  return new Date().toISOString().split("T")[0];
};

const convertDateToRFC3339 = (dateString: string): string => {
  // Convert YYYY-MM-DD to RFC3339 format
  return new Date(dateString).toISOString();
};

const convertRFC3339ToDateString = (rfc3339: string): string => {
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
  groupId,
  groupMembers,
  currentUserId,
  defaultCurrency,
}: ExpenseModalProps) => {
  const isEditMode = mode === "edit";

  // Memoize default beneficiary IDs to prevent unnecessary re-renders
  const defaultBeneficiaryIds = useMemo(
    () => groupMembers.map((m) => m.userId),
    [groupMembers]
  );

  // Helper function to get form defaults based on mode
  const getFormDefaults = useCallback((): FormValues => {
    if (isEditMode && expense) {
      return {
        name: expense.name,
        description: expense.description || "",
        amount: convertAmountToDisplay(expense.amount),
        currency: expense.currency,
        payerId: expense.payerId,
        beneficiariesIds: expense.beneficiariesIds,
        date: convertRFC3339ToDateString(expense.date),
      };
    }

    return {
      name: "",
      description: "",
      amount: 0,
      currency: defaultCurrency,
      payerId: currentUserId,
      beneficiariesIds: defaultBeneficiaryIds,
      date: getTodayDateString(),
    };
  }, [
    isEditMode,
    expense,
    defaultCurrency,
    currentUserId,
    defaultBeneficiaryIds,
  ]);

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

  const queryClient = useQueryClient();

  const { isPending: isCreating, mutate: createMutate } = useMutation(
    createExpense,
    {
      onSuccess: () => {
        toast.success("Expense created!");
        queryClient.invalidateQueries({ queryKey: groupActivityKey });
        queryClient.invalidateQueries({ queryKey: userGroupsKey });
        onOpenChange(false);
      },
      onError: handleError,
    }
  );

  const { isPending: isUpdating, mutate: updateMutate } = useMutation(
    updateExpense,
    {
      onSuccess: () => {
        toast.success("Expense updated!");
        queryClient.invalidateQueries({ queryKey: groupActivityKey });
        queryClient.invalidateQueries({ queryKey: userGroupsKey });
        onOpenChange(false);
      },
      onError: handleError,
    }
  );

  const isPending = isCreating || isUpdating;

  const onSubmit = (data: FormValues) => {
    if (isEditMode && expense) {
      updateMutate({
        id: expense.id,
        payerId: data.payerId,
        name: data.name,
        description: data.description,
        amount: data.amount,
        currency: data.currency,
        beneficiariesIds: data.beneficiariesIds,
        date: convertDateToRFC3339(data.date),
      });
    } else {
      createMutate({
        groupId,
        payerId: data.payerId,
        name: data.name,
        description: data.description,
        amount: data.amount,
        currency: data.currency,
        beneficiariesIds: data.beneficiariesIds,
        date: convertDateToRFC3339(data.date),
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
        current.filter((id) => id !== userId)
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit expense" : "Add new expense"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update expense details."
              : "Create a new expense for this group."}
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
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="description"
              disabled={isPending}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="expenseDesc">
                    Description (optional)
                  </FieldLabel>
                  <Input
                    {...field}
                    id="expenseDesc"
                    placeholder="Additional details..."
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
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
                  <Input
                    {...field}
                    id="expenseDate"
                    type="date"
                    required
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
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
                      onChange={(e) =>
                        field.onChange(e.target.valueAsNumber || 0)
                      }
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
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
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isPending}
                    >
                      <SelectTrigger
                        id="currency"
                        aria-invalid={fieldState.invalid}
                      >
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMON_CURRENCIES.map((currency) => (
                          <SelectItem
                            key={currency.value}
                            value={currency.value}
                          >
                            {currency.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
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
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isPending}
                  >
                    <SelectTrigger id="payer" aria-invalid={fieldState.invalid}>
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
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Field>
              <FieldLabel>Split between</FieldLabel>
              <div className="space-y-3 mt-2">
                {groupMembers.map((member) => (
                  <div
                    key={member.userId}
                    className="flex items-center space-x-2"
                  >
                    <Checkbox
                      id={`beneficiary-${member.userId}`}
                      checked={beneficiariesIds?.includes(member.userId)}
                      onCheckedChange={(checked) =>
                        handleBeneficiaryToggle(member.userId, checked === true)
                      }
                      disabled={isPending}
                    />
                    <Label
                      htmlFor={`beneficiary-${member.userId}`}
                      className="text-sm font-normal cursor-pointer"
                    >
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
