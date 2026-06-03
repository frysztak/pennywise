import type { Meta, StoryObj } from "@storybook/react-vite";

import { AmountInput } from "@/shared/components/amount-input";
import { COMMON_CURRENCIES } from "@/shared/lib/currencies";

const meta = {
  component: AmountInput,
  args: { currencies: COMMON_CURRENCIES },
} satisfies Meta<typeof AmountInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {},
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const InitialValue: Story = {
  args: {
    inputValue: {
      amount: 123.45,
      currency: "USD",
    },
  },
};

// Type an expression like "(10+5)*2" into this story to see the "= 30.00 USD" hint.
export const ExpressionHint: Story = {
  args: {
    inputValue: {
      amount: 0,
      currency: "USD",
    },
  },
};
