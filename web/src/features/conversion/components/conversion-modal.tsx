import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { ArrowRightLeft, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as z from "zod";

import type { ConversionTemplateDefaults } from "@/features/conversion/hooks/use-conversion-modal";
import {
  createConversion,
  getExchangeRate,
  updateConversion,
} from "@/gen/api/v1/conversion-ConversionService_connectquery";
import {
  getGroupActivity,
  getSettlementSuggestions,
  getUserGroups,
} from "@/gen/api/v1/group-GroupService_connectquery";
import type { GetGroupActivityResponse_ActivityItem_Conversion } from "@/gen/api/v1/group_pb";
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
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/shared/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Spinner } from "@/shared/components/ui/spinner";
import { handleError } from "@/shared/lib/utils";

const makeFormSchema = (t: TFunction) =>
  z
    .object({
      fromCurrency: z.string().min(2, t("conversion.validation.fromRequired")),
      toCurrency: z.string().min(2, t("conversion.validation.toRequired")),
      rate: z
        .number({ error: () => t("conversion.validation.rateNumber") })
        .positive(t("conversion.validation.ratePositive")),
      date: z.string().date(t("conversion.validation.dateInvalid")),
    })
    .refine((data) => data.fromCurrency !== data.toCurrency, {
      message: t("conversion.validation.differentCurrencies"),
      path: ["toCurrency"],
    });

type FormValues = z.infer<ReturnType<typeof makeFormSchema>>;

const getTodayDateString = (): string => new Date().toISOString().split("T")[0];

const convertRFC3339ToDateString = (date: Date): string => new Date(date).toISOString().split("T")[0];

interface ConversionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  conversion?: GetGroupActivityResponse_ActivityItem_Conversion;
  templateDefaults?: ConversionTemplateDefaults;
  groupId: string;
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

export const ConversionModal = ({
  open,
  onOpenChange,
  mode,
  conversion,
  templateDefaults,
  groupId,
  defaultCurrency,
  currencies,
}: ConversionModalProps) => {
  const { t } = useTranslation();
  const formSchema = useMemo(() => makeFormSchema(t), [t]);
  const isEditMode = mode === "edit";

  const currencyItems = useMemo(() => currencies.map((c) => ({ value: c, label: c })), [currencies]);

  const getFormDefaults = useCallback((): FormValues => {
    if (isEditMode && conversion) {
      return {
        fromCurrency: conversion.fromCurrency,
        toCurrency: conversion.toCurrency,
        rate: conversion.rate,
        date: convertRFC3339ToDateString(timestampDate(conversion.date!)),
      };
    }

    const from = templateDefaults?.fromCurrency ?? currencies[0] ?? defaultCurrency;
    const fallbackTo = currencies.find((c) => c !== from) ?? from;
    return {
      fromCurrency: from,
      toCurrency: templateDefaults?.toCurrency ?? fallbackTo,
      rate: templateDefaults?.rate ?? 1,
      date: getTodayDateString(),
    };
  }, [isEditMode, conversion, templateDefaults, currencies, defaultCurrency]);

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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: groupActivityKey });
    queryClient.invalidateQueries({ queryKey: userGroupsKey });
    queryClient.invalidateQueries({ queryKey: settlementSuggestionsKey });
  };

  const { isPending: isCreating, mutate: createMutate } = useMutation(createConversion, {
    onSuccess: () => {
      toast.success(t("conversion.recorded"));
      invalidate();
      onOpenChange(false);
    },
    onError: handleError,
  });

  const { isPending: isUpdating, mutate: updateMutate } = useMutation(updateConversion, {
    onSuccess: () => {
      toast.success(t("conversion.updated"));
      invalidate();
      onOpenChange(false);
    },
    onError: handleError,
  });

  const { isPending: isFetchingRate, mutate: fetchRate } = useMutation(getExchangeRate, {
    onSuccess: (res) => {
      form.setValue("rate", res.rate, { shouldValidate: true, shouldDirty: true });
      const rateDate = res.rateDate ? convertRFC3339ToDateString(timestampDate(res.rateDate)) : undefined;
      toast.success(rateDate ? t("conversion.rateFetchedOn", { date: rateDate }) : t("conversion.rateFetched"));
    },
    // The rate is only a convenience pre-fill; on failure the user just types it.
    onError: () => toast.info(t("conversion.rateFetchFailed")),
  });

  const isPending = isCreating || isUpdating;

  const fromCurrency = form.watch("fromCurrency");
  const toCurrency = form.watch("toCurrency");

  const handleFetchRate = () => {
    const date = form.getValues("date");
    fetchRate({
      fromCurrency,
      toCurrency,
      date: timestampFromDate(new Date(date)),
    });
  };

  const onSubmit = (data: FormValues) => {
    if (isEditMode && conversion) {
      updateMutate({
        id: conversion.id,
        groupId,
        fromCurrency: data.fromCurrency,
        toCurrency: data.toCurrency,
        rate: data.rate,
        date: timestampFromDate(new Date(data.date)),
      });
    } else {
      createMutate({
        groupId,
        fromCurrency: data.fromCurrency,
        toCurrency: data.toCurrency,
        rate: data.rate,
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

  const sameCurrency = fromCurrency === toCurrency;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditMode ? t("conversion.edit") : t("conversion.new")}</DialogTitle>
          <DialogDescription>
            {isEditMode ? t("conversion.editDescription") : t("conversion.newDescription")}
          </DialogDescription>
        </DialogHeader>
        <form id="conversion-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Controller
                name="fromCurrency"
                disabled={isPending}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor="fromCurrency">{t("conversion.from")}</FieldLabel>
                    <Select
                      items={currencyItems}
                      value={field.value}
                      onValueChange={(v) => field.onChange(v)}
                      disabled={field.disabled}
                    >
                      <SelectTrigger id="fromCurrency" aria-invalid={fieldState.invalid}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {currencyItems.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="toCurrency"
                disabled={isPending}
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor="toCurrency">{t("conversion.to")}</FieldLabel>
                    <Select
                      items={currencyItems}
                      value={field.value}
                      onValueChange={(v) => field.onChange(v)}
                      disabled={field.disabled}
                    >
                      <SelectTrigger id="toCurrency" aria-invalid={fieldState.invalid || sameCurrency}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {currencyItems.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
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
              name="rate"
              disabled={isPending}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor="rate">{t("conversion.rate")}</FieldLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleFetchRate}
                      disabled={isFetchingRate || isPending || sameCurrency}
                    >
                      {isFetchingRate ? <Spinner /> : <RefreshCw />}
                      {t("conversion.fetchRate")}
                    </Button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium whitespace-nowrap tabular-nums">1 {fromCurrency} =</span>
                    <InputGroup className="flex-1">
                      <InputGroupInput
                        id="rate"
                        type="number"
                        step="any"
                        min="0"
                        inputMode="decimal"
                        value={Number.isNaN(field.value) ? "" : field.value}
                        disabled={field.disabled}
                        aria-invalid={fieldState.invalid}
                        onChange={(e) => field.onChange(e.target.value === "" ? Number.NaN : e.target.valueAsNumber)}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>{toCurrency}</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                  </div>
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
                  <FieldLabel htmlFor="conversionDate">{t("conversion.date")}</FieldLabel>
                  <Input {...field} id="conversionDate" type="date" required aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button type="submit" form="conversion-form" disabled={isPending} size="lg">
            {isPending ? <Spinner /> : <ArrowRightLeft />}
            {isEditMode ? t("conversion.submitEdit") : t("conversion.submitNew")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
