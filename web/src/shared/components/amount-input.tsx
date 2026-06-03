import { type ChangeEvent, useMemo, useState } from "react";

import { ButtonGroup } from "@/shared/components/ui/button-group";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/shared/components/ui/combobox";
import { FieldDescription } from "@/shared/components/ui/field";
import { Input } from "@/shared/components/ui/input";
import { evaluateAmount } from "@/shared/lib/calc-expression";
import { cn } from "@/shared/lib/utils";

export interface AmountWithCurrency {
  currency: string;
  amount: number;
}

export interface AmountInputProps {
  id?: string;
  required?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  currencies: string[];
  inputValue?: AmountWithCurrency;
  onValueChange?: (newValue: AmountWithCurrency) => void;
}

function formatInitial(amount: number | undefined): string {
  if (amount === undefined || amount === 0 || Number.isNaN(amount)) return "";
  return String(amount);
}

export function AmountInput({
  id,
  required,
  invalid,
  disabled,
  currencies,
  inputValue,
  onValueChange,
}: AmountInputProps) {
  const [rawAmount, setRawAmount] = useState<string>(() => formatInitial(inputValue?.amount));
  const [prevExternalAmount, setPrevExternalAmount] = useState(inputValue?.amount);

  // Sync external amount changes (form reset / edit-mode prefill) into rawAmount.
  // "Adjust during render" pattern: Object.is guards prevent NaN !== NaN loops and
  // the feedback loop from typing (type → emit amount → incoming matches → no reset).
  if (!Object.is(prevExternalAmount, inputValue?.amount)) {
    setPrevExternalAmount(inputValue?.amount);
    const result = evaluateAmount(rawAmount);
    const currentValue = result.kind === "number" || result.kind === "expression" ? result.value : NaN;
    if (!Object.is(inputValue?.amount, currentValue)) {
      setRawAmount(formatInitial(inputValue?.amount));
    }
  }

  const result = useMemo(() => evaluateAmount(rawAmount), [rawAmount]);

  const onAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    setRawAmount(text);
    const r = evaluateAmount(text);
    const amount = r.kind === "number" || r.kind === "expression" ? r.value : NaN;
    onValueChange?.({ ...inputValue!, amount });
  };

  const onCurrencyChange = (newCurrency: string | null) => {
    if (newCurrency) {
      onValueChange?.({ ...inputValue!, currency: newCurrency });
    }
  };

  const hint =
    result.kind === "expression"
      ? `= ${result.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${inputValue?.currency ? ` ${inputValue.currency}` : ""}`
      : null;

  return (
    <div className="flex flex-col gap-0">
      <ButtonGroup
        className={cn("w-auto", hint && "[&>[data-slot][data-slot]:not(:has(~[data-slot]))]:rounded-b-none!")}
      >
        <Input
          id={id}
          placeholder="0.00"
          type="text"
          inputMode="decimal"
          required={required}
          aria-invalid={invalid}
          disabled={disabled}
          value={rawAmount}
          onChange={onAmountChange}
          className={cn("transition-[border-radius]", hint && "rounded-b-none")}
        />
        <Combobox
          items={currencies}
          value={inputValue?.currency}
          onValueChange={onCurrencyChange}
          disabled={disabled}
          autoHighlight
        >
          <ComboboxInput
            placeholder="USD"
            disabled={disabled}
            className="w-20 rounded-r-md! transition-[border-radius]"
          />
          <ComboboxContent>
            <ComboboxEmpty>No items found.</ComboboxEmpty>
            <ComboboxList>
              {(item) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </ButtonGroup>
      <FieldDescription
        className={cn(
          "bg-primary/90 text-foreground rounded-b-md py-1 pl-2 transition-[opacity,visibility]",
          hint ? "opacity-100 visible" : "opacity-0 invisible",
        )}
      >
        {hint ?? " "}
      </FieldDescription>
    </div>
  );
}
