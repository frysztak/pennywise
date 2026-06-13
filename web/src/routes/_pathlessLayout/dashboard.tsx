import { useSuspenseQuery } from "@connectrpc/connect-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";

import { ExpenseGroupCard } from "@/features/dashboard/components/expense-group-card";
import { NewGroupModal } from "@/features/sidebar/components/new-group-modal";
import { getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { GroupArchiveFilter } from "@/gen/api/v1/group_pb";
import { Button } from "@/shared/components/ui/button";
import { ButtonGroup } from "@/shared/components/ui/button-group";
import { Spinner } from "@/shared/components/ui/spinner";
import { cn } from "@/shared/lib/utils";

const FILTER_OPTIONS = [
  { value: GroupArchiveFilter.ACTIVE, labelKey: "dashboard.filter.active" },
  { value: GroupArchiveFilter.ARCHIVED, labelKey: "dashboard.filter.archived" },
  { value: GroupArchiveFilter.ALL, labelKey: "dashboard.filter.all" },
] as const;

export const Route = createFileRoute("/_pathlessLayout/dashboard")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Dashboard" }],
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<GroupArchiveFilter>(GroupArchiveFilter.ACTIVE);
  const [isPending, startTransition] = useTransition();
  const { data: groupsData } = useSuspenseQuery(getUserGroups, { filter });
  const [newGroupOpen, setNewGroupOpen] = useState(false);

  const emptyMessage =
    filter === GroupArchiveFilter.ARCHIVED ? t("dashboard.emptyArchived") : t("dashboard.emptyActive");

  return (
    <>
      <div>
        <h1 className="text-5xl font-bold tracking-tight font-serif">{t("dashboard.title")}</h1>
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground mt-2">{t("dashboard.subtitle")}</p>
          <Button variant="outline" onClick={() => setNewGroupOpen(true)}>
            <Plus />
            {t("dashboard.newGroup")}
          </Button>
        </div>
      </div>

      <ButtonGroup className="mt-4">
        {FILTER_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={filter === option.value ? "default" : "outline"}
            onClick={() => startTransition(() => setFilter(option.value))}
          >
            {t(option.labelKey)}
          </Button>
        ))}
      </ButtonGroup>

      <div className="relative">
        {isPending && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <Spinner className="size-8" />
          </div>
        )}
        <div className={cn("transition-all", isPending && "pointer-events-none opacity-60")}>
          {groupsData.groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground mb-4">{emptyMessage}</p>
              {filter !== GroupArchiveFilter.ARCHIVED && (
                <p className="text-sm text-muted-foreground">{t("dashboard.createHint")}</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupsData.groups.map((group) => {
                // Find current user's balance from member balances
                const currentUserBalance = group.memberBalances.find((mb) => mb.userId === group.userId);

                return (
                  <Link key={group.groupId} to="/group/$groupId" params={{ groupId: group.groupId }} className="group">
                    <ExpenseGroupCard
                      groupId={group.groupId}
                      groupName={group.groupName}
                      groupDefaultCurrency={group.groupDefaultCurrency}
                      balance={currentUserBalance?.balance || {}}
                      imageUpdatedAt={group.imageUpdatedAt}
                      members={group.memberBalances.map((m) => ({ userId: m.userId, userName: m.userName }))}
                      archived={group.archived}
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <NewGroupModal open={newGroupOpen} onOpenChange={setNewGroupOpen} />
    </>
  );
}
