import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AmountInput, type AmountWithCurrency } from "@/shared/components/amount-input";
import { renderWithProviders } from "@/test/render";

function setup(initial?: Partial<AmountWithCurrency>) {
  const onValueChange = vi.fn<(v: AmountWithCurrency) => void>();
  const value: AmountWithCurrency = { amount: 0, currency: "USD", ...initial };
  renderWithProviders(<AmountInput currencies={["USD", "EUR"]} inputValue={value} onValueChange={onValueChange} />);
  const input = screen.getByPlaceholderText("0.00") as HTMLInputElement;
  return { input, onValueChange };
}

describe("AmountInput", () => {
  it("emits the parsed amount for a plain number", () => {
    const { input, onValueChange } = setup();
    fireEvent.change(input, { target: { value: "42" } });
    expect(onValueChange.mock.lastCall?.[0]).toEqual({ currency: "USD", amount: 42 });
  });

  it("evaluates an arithmetic expression and shows the result hint", () => {
    const { input, onValueChange } = setup();
    fireEvent.change(input, { target: { value: "10+5" } });
    expect(onValueChange.mock.lastCall?.[0]).toEqual({ currency: "USD", amount: 15 });
    // The component surfaces the evaluated total back to the user.
    expect(screen.getByText(/15\.00/)).toBeTruthy();
  });

  it("treats a comma as a decimal separator", () => {
    const { input, onValueChange } = setup();
    fireEvent.change(input, { target: { value: "1,5" } });
    expect(onValueChange.mock.lastCall?.[0]).toEqual({ currency: "USD", amount: 1.5 });
  });

  it("emits NaN for an invalid expression so the form can reject it", () => {
    const { input, onValueChange } = setup();
    fireEvent.change(input, { target: { value: "10+" } });
    expect(onValueChange.mock.lastCall?.[0].amount).toBeNaN();
  });
});
