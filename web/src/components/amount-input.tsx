import { type ChangeEvent } from "react";

import { COMMON_CURRENCIES } from "@/lib/currencies";

import { ButtonGroup } from "./ui/button-group";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "./ui/combobox";
import { Input } from "./ui/input";

export interface AmountWithCurrency {
  currency: string;
  amount: number;
}

export interface AmountInputProps {
  id?: string;
  required?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  inputValue?: AmountWithCurrency;
  onValueChange?: (newValue: AmountWithCurrency) => void;
}

export function AmountInput({ id, required, invalid, disabled, inputValue, onValueChange }: AmountInputProps) {
  const onAmountChange = (event: ChangeEvent<HTMLInputElement, HTMLInputElement>) => {
    onValueChange?.({ ...inputValue!, amount: event.target.valueAsNumber });
  };

  const onCurrencyChange = (newCurrency: string | null) => {
    if (newCurrency) {
      onValueChange?.({ ...inputValue!, currency: newCurrency });
    }
  };

  return (
    <ButtonGroup className="w-auto">
      <Input
        id={id}
        placeholder="0.00"
        type="number"
        step="0.01"
        required={required}
        aria-invalid={invalid}
        disabled={disabled}
        value={inputValue?.amount || ""}
        onChange={onAmountChange}
      />
      <Combobox
        items={COMMON_CURRENCIES}
        value={inputValue?.currency}
        onValueChange={onCurrencyChange}
        disabled={disabled}
        autoHighlight
      >
        <ComboboxInput placeholder="USD" disabled={disabled} className="w-20 rounded-r-md!" />
        <ComboboxContent>
          <ComboboxEmpty>No items found.</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item.value} value={item.value}>
                {item.value}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </ButtonGroup>
  );
}
