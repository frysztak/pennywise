import { zodResolver } from "@hookform/resolvers/zod";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";

import { MemberAvatar } from "@/components/member-avatar";
import type { MemberBalance } from "@/gen/api/v1/group_pb";
import type { EditingGroup } from "@/hooks/use-edit-group-modal";
import { COMMON_CURRENCIES } from "@/lib/currencies";
import { cn } from "@/lib/utils";

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

const MEMBER_COLORS = ["var(--sage-400)", "var(--blue-400)", "var(--violet-400)", "var(--amber-400)", "var(--red-400)"];

const fmtPct = (n: number) => {
  const pct = n * 100;
  return `${pct.toFixed(pct >= 10 || pct === 0 ? 0 : 1)}%`;
};

interface WeightStepperProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
}

function WeightStepper({ value, onChange, disabled, min = 0, max = 99, step = 0.5, id }: WeightStepperProps) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    if (parseFloat(text) !== value) setText(String(value));
  }, [value, text]);

  const dec = () => onChange(Math.max(min, +(value - step).toFixed(2)));
  const inc = () => onChange(Math.min(max, +(value + step).toFixed(2)));

  return (
    <div className="bg-card border-input inline-flex h-7 items-stretch overflow-hidden rounded-full border">
      <button
        type="button"
        onClick={dec}
        disabled={disabled}
        aria-label="Decrease weight"
        className="text-muted-foreground hover:bg-muted flex w-7 items-center justify-center transition-colors disabled:opacity-50"
      >
        <Minus className="size-3" strokeWidth={2.2} />
      </button>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value.replace(",", ".");
          if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) {
            setText(v);
            const num = v === "" ? 0 : parseFloat(v);
            if (!isNaN(num)) onChange(num);
          }
        }}
        className="text-foreground w-14 border-none bg-transparent text-center font-mono text-[13px] font-medium tabular-nums outline-none disabled:opacity-50"
      />
      <button
        type="button"
        onClick={inc}
        disabled={disabled}
        aria-label="Increase weight"
        className="text-muted-foreground hover:bg-muted flex w-7 items-center justify-center transition-colors disabled:opacity-50"
      >
        <Plus className="size-3" strokeWidth={2.2} />
      </button>
    </div>
  );
}

const formSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    description: z.string(),
    defaultCurrency: z.string().min(2, "Currency is required"),
    currencies: z.array(z.string()).min(1, "Select at least one currency"),
  })
  .refine((data) => data.currencies.includes(data.defaultCurrency), {
    message: "Default currency must be one of the selected currencies",
    path: ["defaultCurrency"],
  });

interface EditGroupDialogProps {
  open: boolean;
  group: EditingGroup;
  memberBalances: MemberBalance[];
  currencies: string[];
  onOpenChange: (open: boolean) => void;
  onUpdateGroup: (data: { name: string; description: string; defaultCurrency: string; currencies: string[] }) => void;
  onUpdateWeight: (userId: string, weight: number) => void;
}

export function EditGroupDialog({
  open,
  group,
  memberBalances,
  currencies,
  onOpenChange,
  onUpdateGroup,
  onUpdateWeight,
}: EditGroupDialogProps) {
  const [editingWeights, setEditingWeights] = useState(() => {
    const weights: Record<string, number> = {};
    memberBalances.forEach((member) => {
      weights[member.userId] = member.weight;
    });
    return weights;
  });

  const [isPending, setIsPending] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: group.groupName,
      description: group.groupDescription,
      defaultCurrency: group.defaultCurrency,
      currencies,
    },
  });

  const selectedCurrencies = form.watch("currencies");
  const defaultCurrencyItems = selectedCurrencies.map((c) => ({ value: c, label: c }));

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    setIsPending(true);

    // Update group details
    onUpdateGroup(data);

    // Update weights for members that have changed
    for (const member of memberBalances) {
      const newWeight = editingWeights[member.userId] ?? 1;
      if (newWeight !== member.weight && newWeight > 0) {
        onUpdateWeight(member.userId, newWeight);
      }
    }

    onOpenChange(false);
    setIsPending(false);
  };

  const setWeight = (userId: string, value: number) => {
    setEditingWeights((prev) => ({ ...prev, [userId]: value }));
  };

  const resetWeights = () => {
    setEditingWeights(Object.fromEntries(memberBalances.map((m) => [m.userId, 1])));
  };

  const totalWeight = Object.values(editingWeights).reduce((a, b) => a + b, 0) || 1;
  const isCustomWeights = !memberBalances.every((m) => (editingWeights[m.userId] ?? 1) === 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Group</DialogTitle>
          <DialogDescription>Update group details and manage member weights</DialogDescription>
        </DialogHeader>
        <form id="edit-group-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Group Details Section */}
          <div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>
            </FieldGroup>
          </div>

          {/* Member Weights Section */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <FieldLabel>Member weights</FieldLabel>
              <button
                type="button"
                onClick={resetWeights}
                aria-hidden={!isCustomWeights}
                tabIndex={isCustomWeights ? 0 : -1}
                className={cn(
                  "border-border text-muted-foreground hover:text-foreground hover:border-input inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                  !isCustomWeights && "pointer-events-none opacity-0",
                )}
              >
                <RotateCcw className="size-2.5" strokeWidth={2.2} />
                Reset
              </button>
            </div>
            <p className="text-muted-foreground mb-3 text-xs leading-snug">
              How expenses split between members. Weight 2.0 pays twice as much as 1.0.
            </p>
            <div className="bg-card rounded-lg border px-3.5 pt-3.5 pb-1.5">
              {/* Stacked allocation bar */}
              <div className="bg-muted mb-1.5 flex h-2 overflow-hidden rounded-full">
                {memberBalances.map((member, i) => {
                  const share = (editingWeights[member.userId] ?? 1) / totalWeight;
                  return (
                    <div
                      key={member.userId}
                      style={{
                        flex: share || 0.0001,
                        background: MEMBER_COLORS[i % MEMBER_COLORS.length],
                        minWidth: share > 0 ? 4 : 0,
                      }}
                      className={cn(
                        "transition-all duration-300 ease-out",
                        i < memberBalances.length - 1 && "border-card border-r-2",
                      )}
                    />
                  );
                })}
              </div>

              {/* Member rows */}
              {memberBalances.map((member, i) => {
                const weight = editingWeights[member.userId] ?? 1;
                const share = weight / totalWeight;
                const color = MEMBER_COLORS[i % MEMBER_COLORS.length];
                return (
                  <div
                    key={member.userId}
                    className={cn(
                      "grid grid-cols-[auto_1fr_auto_auto] items-center gap-2.5 py-2",
                      i > 0 && "border-border/50 border-t",
                    )}
                  >
                    <div className="relative">
                      <MemberAvatar userId={member.userId} username={member.userName} className="size-7 rounded-full" />
                      <div
                        style={{ background: color }}
                        className="border-card absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2"
                      />
                    </div>
                    <div className="truncate text-sm font-medium">{member.userName}</div>
                    <div className="text-muted-foreground min-w-[42px] text-right font-mono text-xs tabular-nums">
                      {fmtPct(share)}
                    </div>
                    <WeightStepper
                      id={`weight-${member.userId}`}
                      value={weight}
                      onChange={(v) => setWeight(member.userId, v)}
                      disabled={isPending}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </form>
        <DialogFooter>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending} size="lg">
              Cancel
            </Button>
            <Button type="submit" form="edit-group-form" disabled={isPending} size="lg">
              {isPending && <Spinner />}
              Save Changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
