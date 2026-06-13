import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useEffect, useMemo } from "react";
import { Controller, type FieldErrors, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
import { AmountInput, type AmountWithCurrency } from "@/shared/components/amount-input";
import { AmountInputTooltip } from "@/shared/components/amount-input-tooltip";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Spinner } from "@/shared/components/ui/spinner";
import { handleError } from "@/shared/lib/utils";

const makeFormSchema = (t: TFunction) =>
  z.object({
    name: z.string().min(2, t("recurringExpense.validation.nameMin")),
    description: z.string(),
    frequency: z.nativeEnum(RecurringFrequency),
    startDate: z.string().date(t("recurringExpense.validation.dateInvalid")),
    amountWithCurrency: z
      .object({
        amount: z.number().positive(t("recurringExpense.validation.amountPositive")).optional(),
        currency: z.string().min(2).optional(),
      })
      .optional(),
    payerId: z.string().optional(),
  });

type FormValues = z.infer<ReturnType<typeof makeFormSchema>>;

interface RecurringExpenseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  groupId: string;
  groupMembers: MemberBalance[];
  currentUserId: string;
  defaultCurrency: string;
  currencies: string[];
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
  currencies,
  recurringExpense,
}: RecurringExpenseModalProps) => {
  const { t } = useTranslation();
  const formSchema = useMemo(() => makeFormSchema(t), [t]);
  const isEditMode = mode === "edit";

  const frequencyItems = [
    { value: RecurringFrequency.DAILY.toString(), label: t("recurringExpense.frequencies.daily") },
    { value: RecurringFrequency.WEEKLY.toString(), label: t("recurringExpense.frequencies.weekly") },
    { value: RecurringFrequency.MONTHLY.toString(), label: t("recurringExpense.frequencies.monthly") },
    { value: RecurringFrequency.YEARLY.toString(), label: t("recurringExpense.frequencies.yearly") },
  ];
  const memberItems = groupMembers.map((m) => ({ value: m.userId, label: m.userName }));

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      frequency: RecurringFrequency.MONTHLY,
      startDate: new Date().toISOString().split("T")[0],
      amountWithCurrency: { amount: undefined, currency: defaultCurrency },
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
        amountWithCurrency: {
          amount: recurringExpense.amount,
          currency: recurringExpense.currency || defaultCurrency,
        },
        payerId: recurringExpense.payerId || currentUserId,
      });
    } else if (open && !isEditMode) {
      form.reset({
        name: "",
        description: "",
        frequency: RecurringFrequency.MONTHLY,
        startDate: new Date().toISOString().split("T")[0],
        amountWithCurrency: { amount: undefined, currency: defaultCurrency },
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
      toast.success(t("recurringExpense.created"));
      queryClient.invalidateQueries({ queryKey: recurringExpensesKey });
      onOpenChange(false);
    },
    onError: handleError,
  });

  const { isPending: isUpdating, mutate: updateMutate } = useMutation(updateRecurringExpense, {
    onSuccess: () => {
      toast.success(t("recurringExpense.updated"));
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
        groupId,
        name: data.name,
        description: data.description,
        frequency: data.frequency,
        amount: data.amountWithCurrency?.amount,
        currency: data.amountWithCurrency?.currency,
        payerId: data.payerId,
      });
    } else {
      createMutate({
        groupId,
        name: data.name,
        description: data.description,
        frequency: data.frequency,
        startDate: timestampFromDate(new Date(data.startDate)),
        amount: data.amountWithCurrency?.amount,
        currency: data.amountWithCurrency?.currency,
        payerId: data.payerId,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditMode ? t("recurringExpense.edit") : t("recurringExpense.new")}</DialogTitle>
          <DialogDescription>
            {isEditMode ? t("recurringExpense.editDescription") : t("recurringExpense.newDescription")}
          </DialogDescription>
        </DialogHeader>
        <form id="recurring-expense-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              disabled={isPending}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>{t("recurringExpense.name")}</FieldLabel>
                  <Input {...field} placeholder={t("recurringExpense.namePlaceholder")} required />
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
                  <FieldLabel>{t("recurringExpense.descriptionLabel")}</FieldLabel>
                  <Input {...field} placeholder={t("recurringExpense.descriptionPlaceholder")} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Controller
                name="frequency"
                control={form.control}
                disabled={isPending}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>{t("recurringExpense.frequency")}</FieldLabel>
                    <Select
                      items={frequencyItems}
                      value={field.value.toString()}
                      onValueChange={(value) => value !== null && field.onChange(parseInt(value))}
                      disabled={isPending}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={RecurringFrequency.DAILY.toString()}>
                          {t("recurringExpense.frequencies.daily")}
                        </SelectItem>
                        <SelectItem value={RecurringFrequency.WEEKLY.toString()}>
                          {t("recurringExpense.frequencies.weekly")}
                        </SelectItem>
                        <SelectItem value={RecurringFrequency.MONTHLY.toString()}>
                          {t("recurringExpense.frequencies.monthly")}
                        </SelectItem>
                        <SelectItem value={RecurringFrequency.YEARLY.toString()}>
                          {t("recurringExpense.frequencies.yearly")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="amountWithCurrency"
                control={form.control}
                disabled={isPending}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor="amountWithCurrency">
                      {t("recurringExpense.amount")}
                      <AmountInputTooltip />
                    </FieldLabel>
                    <AmountInput
                      id="amountWithCurrency"
                      currencies={currencies}
                      inputValue={field.value as NonNullable<AmountWithCurrency>}
                      disabled={field.disabled}
                      onValueChange={field.onChange}
                      invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && (
                      <FieldError
                        errors={[
                          (fieldState.error as FieldErrors<NonNullable<FormValues["amountWithCurrency"]>>)?.amount ||
                            (fieldState.error as FieldErrors<NonNullable<FormValues["amountWithCurrency"]>>)?.currency,
                        ]}
                      />
                    )}
                  </Field>
                )}
              />
            </div>

            {!isEditMode && (
              <Controller
                name="startDate"
                control={form.control}
                disabled={isPending}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>{t("recurringExpense.startDate")}</FieldLabel>
                    <Input {...field} type="date" required />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            )}

            <Controller
              name="payerId"
              control={form.control}
              disabled={isPending}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>{t("recurringExpense.defaultPayer")}</FieldLabel>
                  <Select items={memberItems} value={field.value} onValueChange={field.onChange} disabled={isPending}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("recurringExpense.selectPayer")} />
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
              {t("recurringExpense.splitNote")}
            </div>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button type="submit" form="recurring-expense-form" disabled={isPending} size="lg">
            {isPending && <Spinner />}
            {isEditMode ? t("recurringExpense.submitEdit") : t("recurringExpense.submitNew")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
