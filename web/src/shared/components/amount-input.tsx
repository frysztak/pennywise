import { Delete } from "lucide-react";
import { type ChangeEvent, type PointerEvent, useMemo, useRef, useState } from "react";

import { Button } from "@/shared/components/ui/button";
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
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { evaluateAmount } from "@/shared/lib/calc-expression";
import { cn } from "@/shared/lib/utils";

// Mobile numeric keyboards omit operators, so we surface them as tap targets.
// `label` is what the user sees; `insert` is what's spliced into the expression.
const OPERATOR_KEYS: { label: string; insert: string }[] = [
  { label: "+", insert: "+" },
  { label: "−", insert: "-" },
  { label: "×", insert: "*" },
  { label: "÷", insert: "/" },
  { label: "(", insert: "(" },
  { label: ")", insert: ")" },
];

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
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
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

  const emit = (text: string) => {
    setRawAmount(text);
    const r = evaluateAmount(text);
    const amount = r.kind === "number" || r.kind === "expression" ? r.value : NaN;
    onValueChange?.({ ...inputValue!, amount });
  };

  const onAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    emit(event.target.value);
  };

  // Splice text in at the caret (replacing any selection) and restore the caret
  // after React re-renders the controlled input, keeping the keyboard focused.
  const replaceSelection = (replacement: string, caretShift: number) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? rawAmount.length;
    const end = el?.selectionEnd ?? rawAmount.length;
    emit(rawAmount.slice(0, start) + replacement + rawAmount.slice(end));
    const caret = start + caretShift;
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (node) {
        node.focus();
        node.setSelectionRange(caret, caret);
      }
    });
  };

  const insertAtCaret = (text: string) => replaceSelection(text, text.length);

  const backspaceAtCaret = () => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? rawAmount.length;
    const end = el?.selectionEnd ?? rawAmount.length;
    if (start !== end) {
      replaceSelection("", 0);
    } else if (start > 0) {
      const next = rawAmount.slice(0, start - 1) + rawAmount.slice(start);
      emit(next);
      requestAnimationFrame(() => {
        const node = inputRef.current;
        if (node) {
          node.focus();
          node.setSelectionRange(start - 1, start - 1);
        }
      });
    }
  };

  // Prevent the tap from blurring the input (which would dismiss the keyboard
  // and drop the caret position) while still letting the click handler fire.
  const keepFocus = (event: PointerEvent) => event.preventDefault();

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
          ref={inputRef}
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
      {isMobile && (
        <div className="mt-1.5 flex gap-1">
          {OPERATOR_KEYS.map(({ label, insert }) => (
            <Button
              key={label}
              type="button"
              variant="outline"
              size="sm"
              tabIndex={-1}
              disabled={disabled}
              aria-label={`Insert ${label}`}
              className="flex-1 font-mono text-base"
              onPointerDown={keepFocus}
              onClick={() => insertAtCaret(insert)}
            >
              {label}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            tabIndex={-1}
            disabled={disabled}
            aria-label="Delete"
            className="flex-1"
            onPointerDown={keepFocus}
            onClick={backspaceAtCaret}
          >
            <Delete />
          </Button>
        </div>
      )}
    </div>
  );
}
