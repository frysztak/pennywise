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
  getGroupExpenses,
} from "@/gen/api/v1/expense-ExpenseService_connectquery";
import { getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
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
import type { GetGroupExpensesResponse_Expense } from "@/gen/api/v1/expense_pb";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string(),
  amount: z.string().min(1, "Amount is required").refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, "Amount must be a positive number"),
  currency: z.string().min(2, "Currency is required"),
  payerId: z.string().min(1, "Payer is required"),
  beneficiariesIds: z.array(z.string()).min(1, "At least one beneficiary is required"),
  date: z.string().date("Invalid date format"),
});

const COMMON_CURRENCIES = [
  // Major currencies (by forex trading volume)
  { value: "USD", label: "USD - US Dollar" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "JPY", label: "JPY - Japanese Yen" },
  { value: "GBP", label: "GBP - British Pound" },
  { value: "AUD", label: "AUD - Australian Dollar" },
  { value: "CAD", label: "CAD - Canadian Dollar" },
  { value: "CHF", label: "CHF - Swiss Franc" },
  { value: "CNY", label: "CNY - Chinese Yuan" },
  { value: "HKD", label: "HKD - Hong Kong Dollar" },
  { value: "SGD", label: "SGD - Singapore Dollar" },
  { value: "SEK", label: "SEK - Swedish Krona" },
  { value: "KRW", label: "KRW - South Korean Won" },
  { value: "NOK", label: "NOK - Norwegian Krone" },
  { value: "NZD", label: "NZD - New Zealand Dollar" },
  { value: "MXN", label: "MXN - Mexican Peso" },
  { value: "INR", label: "INR - Indian Rupee" },
  { value: "RUB", label: "RUB - Russian Ruble" },
  { value: "BRL", label: "BRL - Brazilian Real" },
  { value: "ZAR", label: "ZAR - South African Rand" },
  { value: "TRY", label: "TRY - Turkish Lira" },
  { value: "DKK", label: "DKK - Danish Krone" },
  { value: "PLN", label: "PLN - Polish Zloty" },
  { value: "THB", label: "THB - Thai Baht" },
  { value: "CZK", label: "CZK - Czech Koruna" },
  { value: "ILS", label: "ILS - Israeli Shekel" },
  { value: "HUF", label: "HUF - Hungarian Forint" },
  { value: "CLP", label: "CLP - Chilean Peso" },
  { value: "PHP", label: "PHP - Philippine Peso" },
  { value: "AED", label: "AED - UAE Dirham" },
  { value: "ARS", label: "ARS - Argentine Peso" },
];

// Helper functions for amount conversion
const convertAmountToDisplay = (amount: bigint | number): string => {
  return (Number(amount) / 100).toString();
};

const convertAmountToServer = (displayAmount: string): number => {
  return parseFloat(displayAmount);
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
  expense?: GetGroupExpensesResponse_Expense; // Required when mode='edit'

  // Data dependencies
  groupId: string;
  groupMembers: MemberBalance[];
  currentUserId: string;
  defaultCurrency?: string;
}

export const ExpenseModal = ({
  open,
  onOpenChange,
  mode,
  expense,
  groupId,
  groupMembers,
  currentUserId,
  defaultCurrency = "USD",
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
      amount: "",
      currency: defaultCurrency,
      payerId: currentUserId,
      beneficiariesIds: defaultBeneficiaryIds,
      date: getTodayDateString(),
    };
  }, [isEditMode, expense, defaultCurrency, currentUserId, defaultBeneficiaryIds]);

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

  const groupExpensesKey = createConnectQueryKey({
    schema: getGroupExpenses,
    cardinality: "finite",
    input: { groupId },
  });

  const userGroupsKey = createConnectQueryKey({
    schema: getUserGroups,
    cardinality: "finite",
  });

  const queryClient = useQueryClient();

  const { isPending: isCreating, mutate: createMutate } = useMutation(createExpense, {
    onSuccess: () => {
      toast.success("Expense created!");
      queryClient.invalidateQueries({ queryKey: groupExpensesKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      onOpenChange(false);
    },
    onError: handleError,
  });

  const { isPending: isUpdating, mutate: updateMutate } = useMutation(updateExpense, {
    onSuccess: () => {
      toast.success("Expense updated!");
      queryClient.invalidateQueries({ queryKey: groupExpensesKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      onOpenChange(false);
    },
    onError: handleError,
  });

  const isPending = isCreating || isUpdating;

  const onSubmit = (data: FormValues) => {
    if (isEditMode && expense) {
      updateMutate({
        id: expense.id,
        payerId: data.payerId,
        name: data.name,
        description: data.description,
        amount: convertAmountToServer(data.amount),
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
        amount: convertAmountToServer(data.amount),
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
      form.setValue("beneficiariesIds", current.filter((id) => id !== userId));
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
                  <FieldLabel htmlFor="expenseDesc">Description (optional)</FieldLabel>
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
                  <div key={member.userId} className="flex items-center space-x-2">
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
