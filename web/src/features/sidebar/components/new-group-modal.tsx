import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { Plus } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as z from "zod";

import { createExpenseGroup, getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
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
import { useCurrencies } from "@/shared/hooks/use-currencies";
import { handleError } from "@/shared/lib/utils";

const makeFormSchema = (t: TFunction) =>
  z
    .object({
      name: z.string().min(2),
      description: z.string(),
      defaultCurrency: z.string().min(2, t("group.form.currencyRequired")),
      currencies: z.array(z.string()).min(1, t("group.form.selectAtLeastOne")),
    })
    .refine((data) => data.currencies.includes(data.defaultCurrency), {
      message: t("group.form.defaultMustBeSelected"),
      path: ["defaultCurrency"],
    });

type FormSchema = ReturnType<typeof makeFormSchema>;
const userGroupsKey = createConnectQueryKey({
  schema: getUserGroups,
  cardinality: "finite",
});

interface NewGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NewGroupModal = ({ open, onOpenChange }: NewGroupModalProps) => {
  const { t } = useTranslation();
  const currencyOptions = useCurrencies();
  const formSchema = useMemo(() => makeFormSchema(t), [t]);
  const form = useForm<z.infer<FormSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      defaultCurrency: "EUR",
      currencies: ["EUR"],
    },
  });

  const selectedCurrencies = form.watch("currencies");
  const defaultCurrencyItems = selectedCurrencies.map((c) => ({ value: c, label: c }));

  const { isPending, mutate } = useMutation(createExpenseGroup, {
    onSuccess: () => {
      toast.success(t("group.created"));
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      onOpenChange(false);
    },
    onError: handleError,
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) form.reset();
  }, [open, form]);

  const onSubmit = (data: z.infer<FormSchema>) => {
    mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("group.new.title")}</DialogTitle>
          <DialogDescription>{t("group.new.description")}</DialogDescription>
        </DialogHeader>
        <form id="new-group-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="name"
              disabled={isPending}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="groupName">{t("group.form.name")}</FieldLabel>
                  <Input
                    {...field}
                    id="groupName"
                    placeholder={t("group.form.namePlaceholder")}
                    required
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="description"
              disabled={isPending}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="groupDesc">{t("group.form.description")}</FieldLabel>
                  <Input {...field} id="groupDesc" aria-invalid={fieldState.invalid} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="currencies"
              disabled={isPending}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="groupCurrencies">{t("group.form.currencies")}</FieldLabel>
                  <Select
                    multiple
                    items={currencyOptions.map((c) => ({ value: c, label: c }))}
                    value={field.value}
                    onValueChange={(values) => {
                      field.onChange(values);
                      if (!values.includes(form.getValues("defaultCurrency")) && values.length > 0) {
                        form.setValue("defaultCurrency", values[0], { shouldValidate: true });
                      }
                    }}
                  >
                    <SelectTrigger
                      id="groupCurrencies"
                      aria-invalid={fieldState.invalid}
                      disabled={isPending}
                      className="w-full"
                    >
                      <SelectValue placeholder={t("group.form.selectCurrencies")}>
                        {(value: string[]) =>
                          value.length === 0 ? t("group.form.selectCurrencies") : value.join(", ")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {currencyOptions.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="defaultCurrency"
              disabled={isPending}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="defaultCurrency">{t("group.form.defaultCurrency")}</FieldLabel>
                  <Select
                    items={defaultCurrencyItems}
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isPending || defaultCurrencyItems.length === 0}
                  >
                    <SelectTrigger id="defaultCurrency" aria-invalid={fieldState.invalid}>
                      <SelectValue placeholder={t("group.form.selectCurrency")} />
                    </SelectTrigger>
                    <SelectContent>
                      {defaultCurrencyItems.map((currency) => (
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
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button type="submit" form="new-group-form" disabled={isPending} size="lg">
            {isPending ? <Spinner /> : <Plus />}
            {t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
