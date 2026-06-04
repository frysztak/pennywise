import { useSuspenseQuery } from "@connectrpc/connect-query";
import { useMemo, useState } from "react";

import { EmptyState } from "@/features/group/components/empty-state";
import { getGroupStats } from "@/gen/api/v1/group-GroupService_connectquery";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";

import { BalanceOverTimeChart } from "./balance-over-time-chart";
import { CumulativeSpendChart } from "./cumulative-spend-chart";
import { SpendPerUserChart } from "./spend-per-user-chart";
import { StatsKpis } from "./stats-kpis";

interface GroupStatsProps {
  groupId: string;
  defaultCurrency: string;
  members: { userId: string; userName: string }[];
}

export function GroupStats({ groupId, defaultCurrency, members }: GroupStatsProps) {
  const { data: stats } = useSuspenseQuery(getGroupStats, { groupId });

  // Currencies that actually have activity, so the selector doesn't offer empty views.
  const currencies = useMemo(() => {
    const activeCurrencies = new Set<string>();
    for (const c of Object.keys(stats.totalSpending)) activeCurrencies.add(c);
    for (const series of stats.balanceOverTime) activeCurrencies.add(series.currency);

    return Array.from(activeCurrencies).sort((a, b) => {
      if (a === defaultCurrency) return -1;
      if (b === defaultCurrency) return 1;
      return a.localeCompare(b);
    });
  }, [stats.totalSpending, stats.balanceOverTime, defaultCurrency]);

  const [currency, setCurrency] = useState(
    currencies.includes(defaultCurrency) ? defaultCurrency : (currencies[0] ?? defaultCurrency),
  );

  if (stats.expenseCount === 0n && stats.transferCount === 0n) {
    return <EmptyState title="No activity yet" description="Add an expense to start seeing stats for this group." />;
  }

  const currencyOptions = currencies.map((c) => ({ value: c, label: c }));

  return (
    <div className="flex flex-col gap-6">
      {currencies.length > 1 && (
        <div className="flex items-center justify-end">
          <Select items={currencyOptions} value={currency} onValueChange={(value) => value && setCurrency(value)}>
            <SelectTrigger className="w-28" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencyOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <StatsKpis stats={stats} currency={currency} />
      <CumulativeSpendChart series={stats.cumulativeSpending} currency={currency} />
      <SpendPerUserChart memberSpending={stats.memberSpending} currency={currency} />
      <BalanceOverTimeChart series={stats.balanceOverTime} members={members} currency={currency} />
    </div>
  );
}
