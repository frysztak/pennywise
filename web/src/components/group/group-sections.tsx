import { useSuspenseQuery } from "@connectrpc/connect-query";
import type { ReactNode } from "react";

import { ActivitySection } from "@/components/group/activity-section";
import { EmptyState } from "@/components/group/empty-state";
import { GroupBalances } from "@/components/group/group-balances";
import { SettlementSuggestions } from "@/components/group/settlement-suggestions";
import { getSettlementSuggestions } from "@/gen/api/v1/group-GroupService_connectquery";
import type { MemberBalance } from "@/gen/api/v1/group_pb";
import type { useDeleteExpenseModal } from "@/hooks/use-delete-expense-modal";
import type { useDeleteTransferModal } from "@/hooks/use-delete-transfer-modal";
import type { useExpenseModal } from "@/hooks/use-expense-modal";
import type { useTransferModal } from "@/hooks/use-transfer-modal";

interface GroupSectionsProps {
  groupId: string;
  memberBalances: MemberBalance[];
  currencies: string[];
  currentUserId: string;
  defaultCurrency: string;
  remindersSlot: ReactNode;
  onSettle: ReturnType<typeof useTransferModal>["openCreate"];
  onEditExpense: ReturnType<typeof useExpenseModal>["openEdit"];
  onDeleteExpense: ReturnType<typeof useDeleteExpenseModal>["confirmDelete"];
  onEditTransfer: ReturnType<typeof useTransferModal>["openEdit"];
  onDeleteTransfer: ReturnType<typeof useDeleteTransferModal>["confirmDelete"];
}

export function GroupSections({
  groupId,
  memberBalances,
  currencies,
  currentUserId,
  defaultCurrency,
  remindersSlot,
  onSettle,
  onEditExpense,
  onDeleteExpense,
  onEditTransfer,
  onDeleteTransfer,
}: GroupSectionsProps) {
  const { data: settlementData } = useSuspenseQuery(getSettlementSuggestions, { groupId });

  const otherMembers = memberBalances.filter((m) => m.userId !== currentUserId);
  const noBalances = otherMembers.length === 0;
  const noDebts = settlementData.suggestions.length === 0;

  const members = memberBalances.map((m) => ({ id: m.userId, name: m.userName }));

  const activitySection = (
    <div>
      <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
      <ActivitySection
        groupId={groupId}
        currencies={currencies}
        members={members}
        onEditExpense={onEditExpense}
        onDeleteExpense={onDeleteExpense}
        onEditTransfer={onEditTransfer}
        onDeleteTransfer={onDeleteTransfer}
      />
    </div>
  );

  const balancesSection = (
    <div>
      <h2 className="text-xl font-bold mb-4">Group Balances</h2>
      <GroupBalances memberBalances={memberBalances} currentUserId={currentUserId} defaultCurrency={defaultCurrency} />
    </div>
  );

  const settleSection = (
    <div>
      <h2 className="text-xl font-bold mb-4">Settle Up</h2>
      <SettlementSuggestions groupId={groupId} currentUserId={currentUserId} onSettle={onSettle} />
    </div>
  );

  if (noBalances && noDebts) {
    return (
      <>
        <EmptyState title="All settled" description="No balances, no debts. Add a group member to get started." />
        {remindersSlot}
        {activitySection}
      </>
    );
  } else if (noBalances) {
    return (
      <>
        <EmptyState
          title="Everyone's even"
          description="No balances yet. They'll appear here once someone adds an expense."
        />
        {settleSection}
        {remindersSlot}
        {activitySection}
      </>
    );
  }

  return (
    <>
      {balancesSection}
      {settleSection}
      {remindersSlot}
      {activitySection}
    </>
  );
}
