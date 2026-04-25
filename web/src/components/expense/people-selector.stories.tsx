import { create } from "@bufbuild/protobuf";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { type MemberBalance, MemberBalanceSchema } from "@/gen/api/v1/group_pb";

import { PeopleSelector } from "./people-selector";

const makeMember = (userId: string, userName: string, weight = 1): MemberBalance =>
  create(MemberBalanceSchema, { userId, userName, weight, balance: {} });

const MEMBERS: MemberBalance[] = [
  makeMember("alice", "Alice"),
  makeMember("bob", "Bob"),
  makeMember("charlie", "Charlie"),
];

const meta = {
  component: PeopleSelector,
  render: (args) => {
    const [payerId, setPayerId] = useState(args.payerId);
    const [beneficiaryIds, setBeneficiaryIds] = useState(args.beneficiaryIds);
    return (
      <PeopleSelector
        {...args}
        payerId={payerId}
        beneficiaryIds={beneficiaryIds}
        onPayerChange={setPayerId}
        onBeneficiariesChange={setBeneficiaryIds}
      />
    );
  },
} satisfies Meta<typeof PeopleSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    members: MEMBERS,
    payerId: "alice",
    beneficiaryIds: MEMBERS.map((m) => m.userId),
    totalAmount: 48.2,
    currency: "EUR",
    currentUserId: "alice",
    onPayerChange: () => {},
    onBeneficiariesChange: () => {},
  },
};

export const WeightedSplit: Story = {
  args: {
    ...Default.args!,
    members: [
      makeMember("alice", "Alice", 2),
      makeMember("bob", "Bob", 1),
      makeMember("charlie", "Charlie", 1),
    ],
  },
};

export const SomeExcluded: Story = {
  args: {
    ...Default.args!,
    beneficiaryIds: ["alice", "bob"],
  },
};

export const Disabled: Story = {
  args: {
    ...Default.args!,
    disabled: true,
  },
};

export const SinglePerson: Story = {
  args: {
    ...Default.args!,
    beneficiaryIds: ["alice"],
  },
};
