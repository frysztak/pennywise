import type { Meta, StoryObj } from "@storybook/react-vite";

import { COMMON_CURRENCIES } from "@/lib/currencies";

import { AmountInput } from "./amount-input";

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
