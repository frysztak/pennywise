import { useSuspenseQuery } from "@connectrpc/connect-query";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

import type { useDeleteExpenseModal } from "@/features/expense/hooks/use-delete-expense-modal";
import type { useExpenseModal } from "@/features/expense/hooks/use-expense-modal";
import { ActivitySection } from "@/features/group/components/activity-section";
import { EmptyState } from "@/features/group/components/empty-state";
import { GroupBalances } from "@/features/group/components/group-balances";
import { SettlementSuggestions } from "@/features/group/components/settlement-suggestions";
import type { useDeleteTransferModal } from "@/features/transfer/hooks/use-delete-transfer-modal";
import type { useTransferModal } from "@/features/transfer/hooks/use-transfer-modal";
import { getSettlementSuggestions } from "@/gen/api/v1/group-GroupService_connectquery";
import type { MemberBalance } from "@/gen/api/v1/group_pb";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";

interface GroupSectionsProps {
  className?: string;
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
      <h2 className="text-xl font-bold my-4">Recent Activity</h2>
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

  const balancesAndSettleSection = (
    <div className="grid gap-3 md:grid-cols-2 mb-3">
      <div>
        <h2 className="text-xl font-bold mb-4">Group Balances</h2>
        <GroupBalances
          memberBalances={memberBalances}
          currentUserId={currentUserId}
          defaultCurrency={defaultCurrency}
        />
      </div>

      <div>
        <h2 className="text-xl font-bold mb-4">
          Settle Up{" "}
          <Tooltip>
            <TooltipTrigger>
              <Info className="w-4 h-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              These suggestions are optimized to minimize the number of transfers. The suggested payer may differ from
              who originally owed the money.
            </TooltipContent>
          </Tooltip>
        </h2>
        <SettlementSuggestions groupId={groupId} currentUserId={currentUserId} onSettle={onSettle} />
      </div>
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
        {remindersSlot}
        {activitySection}
      </>
    );
  }

  return (
    <>
      {balancesAndSettleSection}
      {remindersSlot}
      {activitySection}
    </>
  );
}
