import { useQuery } from "@connectrpc/connect-query";
import { useEffect, useState } from "react";

import { ActivityCards } from "@/components/group/activity-cards";
import { ActivityFilters, type ActivityFiltersState } from "@/components/group/activity-filters";
import { ActivityPagination } from "@/components/group/activity-pagination";
import { ActivityTable } from "@/components/group/activity-table";
import { Spinner } from "@/components/ui/spinner";
import { getGroupActivity } from "@/gen/api/v1/group-GroupService_connectquery";
import { ActivityTypeFilter } from "@/gen/api/v1/group_pb";
import type { useDeleteExpenseModal } from "@/hooks/use-delete-expense-modal";
import type { useDeleteTransferModal } from "@/hooks/use-delete-transfer-modal";
import type { useExpenseModal } from "@/hooks/use-expense-modal";
import type { useTransferModal } from "@/hooks/use-transfer-modal";

const LIMIT = 20;

interface ActivitySectionProps {
  groupId: string;
  currencies: string[];
  members: { id: string; name: string }[];
  onEditExpense: ReturnType<typeof useExpenseModal>["openEdit"];
  onDeleteExpense: ReturnType<typeof useDeleteExpenseModal>["confirmDelete"];
  onEditTransfer: ReturnType<typeof useTransferModal>["openEdit"];
  onDeleteTransfer: ReturnType<typeof useDeleteTransferModal>["confirmDelete"];
}

export function ActivitySection({
  groupId,
  currencies,
  members,
  onEditExpense,
  onDeleteExpense,
  onEditTransfer,
  onDeleteTransfer,
}: ActivitySectionProps) {
  const [filters, setFilters] = useState<ActivityFiltersState>({});
  // Cursor stack: [undefined] means first page; each push adds a next cursor.
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);

  const cursor = cursorStack[cursorStack.length - 1];

  const { data, isFetching } = useQuery(getGroupActivity, {
    groupId,
    page: { limit: LIMIT, cursor },
    typeFilter: filters.typeFilter ?? ActivityTypeFilter.UNSPECIFIED,
    currencyFilter: filters.currencyFilter,
    memberFilter: filters.memberFilter,
  });

  const totalCount = Number(data?.page?.totalCount ?? 0n);
  const totalPages = Math.max(1, Math.ceil(totalCount / LIMIT));
  const pageIndex = cursorStack.length - 1;
  const canPrev = cursorStack.length > 1;
  const canNext = totalCount > 0 && pageIndex + 1 < totalPages;

  // Reset to page 1 whenever filters change.
  useEffect(() => {
    setCursorStack([undefined]);
  }, [filters]);

  const handleNext = (nextCursor: string | undefined) => {
    if (nextCursor) setCursorStack((s) => [...s, nextCursor]);
  };
  const handlePrev = () => setCursorStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  const recentActivity = (data?.items ?? []).map((item) => {
    if (item.data.case === "expense") return { type: "expense" as const, data: item.data.value };
    if (item.data.case === "transfer") return { type: "transfer" as const, data: item.data.value };
    throw new Error("Unknown activity item type");
  });

  const callbacks = { onEditExpense, onDeleteExpense, onEditTransfer, onDeleteTransfer };

  return (
    <div className="flex flex-col gap-4">
      <ActivityFilters
        {...filters}
        currencies={currencies}
        members={members}
        onChange={(next) => setFilters((f) => ({ ...f, ...next }))}
      />

      <div className="relative">
        {isFetching && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60">
            <Spinner className="size-5" />
          </div>
        )}
        <div className="hidden md:block">
          <ActivityTable recentActivity={recentActivity} {...callbacks} />
        </div>
        <div className="md:hidden">
          <ActivityCards recentActivity={recentActivity} {...callbacks} />
        </div>
      </div>

      <ActivityPagination
        pageIndex={pageIndex}
        totalPages={totalPages}
        totalCount={totalCount}
        limit={LIMIT}
        itemsOnPage={recentActivity.length}
        canPrev={canPrev}
        canNext={canNext}
        isLoading={isFetching}
        onPrev={handlePrev}
        onNext={() => handleNext(data?.page?.nextCursor)}
      />
    </div>
  );
}
