import { useSuspenseQuery } from "@connectrpc/connect-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { useConversionModal } from "@/features/conversion/hooks/use-conversion-modal";
import type { useDeleteConversionModal } from "@/features/conversion/hooks/use-delete-conversion-modal";
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
  onEditConversion: ReturnType<typeof useConversionModal>["openEdit"];
  onDeleteConversion: ReturnType<typeof useDeleteConversionModal>["confirmDelete"];
  isArchived?: boolean;
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
  onEditConversion,
  onDeleteConversion,
  isArchived,
}: GroupSectionsProps) {
  const { t } = useTranslation();
  const { data: settlementData } = useSuspenseQuery(getSettlementSuggestions, { groupId });

  const otherMembers = memberBalances.filter((m) => m.userId !== currentUserId);
  const noBalances = otherMembers.length === 0;
  const noDebts = settlementData.suggestions.length === 0;

  const members = memberBalances.map((m) => ({ id: m.userId, name: m.userName }));

  const activitySection = (
    <div>
      <h2 className="text-xl font-bold my-4">{t("group.recentActivity")}</h2>
      <ActivitySection
        groupId={groupId}
        currencies={currencies}
        members={members}
        onEditExpense={onEditExpense}
        onDeleteExpense={onDeleteExpense}
        onEditTransfer={onEditTransfer}
        onDeleteTransfer={onDeleteTransfer}
        onEditConversion={onEditConversion}
        onDeleteConversion={onDeleteConversion}
        isArchived={isArchived}
      />
    </div>
  );

  const balancesAndSettleSection = (
    <div className="grid gap-3 md:grid-cols-2 mb-3">
      <div>
        <h2 className="text-xl font-bold mb-4">{t("group.balancesTitle")}</h2>
        <GroupBalances
          memberBalances={memberBalances}
          currentUserId={currentUserId}
          defaultCurrency={defaultCurrency}
        />
      </div>

      <div>
        <SettlementSuggestions
          groupId={groupId}
          currentUserId={currentUserId}
          currencies={currencies}
          defaultCurrency={defaultCurrency}
          onSettle={onSettle}
          isArchived={isArchived}
        />
      </div>
    </div>
  );

  if (noBalances && noDebts) {
    return (
      <>
        <EmptyState title={t("group.emptyAllSettled.title")} description={t("group.emptyAllSettled.description")} />
        {remindersSlot}
        {activitySection}
      </>
    );
  } else if (noBalances) {
    return (
      <>
        <EmptyState title={t("group.emptyEven.title")} description={t("group.emptyEven.description")} />
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
