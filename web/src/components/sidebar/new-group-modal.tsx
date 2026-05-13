import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

import { createExpenseGroup, getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { COMMON_CURRENCIES } from "@/lib/currencies";
import { handleError } from "@/lib/utils";

import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectItem,
  MultiSelectTrigger,
  MultiSelectValue,
} from "../ui/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";

const formSchema = z
  .object({
    name: z.string().min(2),
    description: z.string(),
    defaultCurrency: z.string().min(2, "Currency is required"),
    currencies: z.array(z.string()).min(1, "Select at least one currency"),
  })
  .refine((data) => data.currencies.includes(data.defaultCurrency), {
    message: "Default currency must be one of the selected currencies",
    path: ["defaultCurrency"],
  });
const userGroupsKey = createConnectQueryKey({
  schema: getUserGroups,
  cardinality: "finite",
});

interface NewGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NewGroupModal = ({ open, onOpenChange }: NewGroupModalProps) => {
  const form = useForm<z.infer<typeof formSchema>>({
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
      toast.success("Group created!");
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      onOpenChange(false);
    },
    onError: handleError,
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) form.reset();
  }, [open, form]);

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add new group</DialogTitle>
          <DialogDescription>Create new expense group.</DialogDescription>
        </DialogHeader>
        <form id="new-group-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="name"
              disabled={isPending}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="groupName">Group name</FieldLabel>
                  <Input
                    {...field}
                    id="groupName"
                    placeholder="My group..."
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
                  <FieldLabel htmlFor="groupDesc">Group description</FieldLabel>
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
                  <FieldLabel htmlFor="groupCurrencies">Currencies</FieldLabel>
                  <MultiSelect
                    values={field.value}
                    onValuesChange={(values) => {
                      field.onChange(values);
                      if (!values.includes(form.getValues("defaultCurrency")) && values.length > 0) {
                        form.setValue("defaultCurrency", values[0], { shouldValidate: true });
                      }
                    }}
                  >
                    <MultiSelectTrigger
                      id="groupCurrencies"
                      aria-invalid={fieldState.invalid}
                      disabled={isPending}
                      className="w-full"
                    >
                      <MultiSelectValue placeholder="Select currencies" />
                    </MultiSelectTrigger>
                    <MultiSelectContent>
                      {COMMON_CURRENCIES.map((c) => (
                        <MultiSelectItem key={c} value={c}>
                          {c}
                        </MultiSelectItem>
                      ))}
                    </MultiSelectContent>
                  </MultiSelect>
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
                  <FieldLabel htmlFor="defaultCurrency">Default currency</FieldLabel>
                  <Select
                    items={defaultCurrencyItems}
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isPending || defaultCurrencyItems.length === 0}
                  >
                    <SelectTrigger id="defaultCurrency" aria-invalid={fieldState.invalid}>
                      <SelectValue placeholder="Select currency" />
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
            {isPending && <Spinner />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
