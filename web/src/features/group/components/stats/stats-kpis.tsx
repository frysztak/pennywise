import { useTranslation } from "react-i18next";

import type { GetGroupStatsResponse } from "@/gen/api/v1/group_pb";
import { Card } from "@/shared/components/ui/card";

import { formatCents } from "./format";

interface StatsKpisProps {
  stats: GetGroupStatsResponse;
  currency: string;
}

interface Kpi {
  label: string;
  value: string;
}

export function StatsKpis({ stats, currency }: StatsKpisProps) {
  const { t } = useTranslation();
  const totalSpent = stats.totalSpending[currency] ?? 0n;
  const largest = stats.largestExpense[currency] ?? 0n;

  const kpis: Kpi[] = [
    { label: t("stats.totalSpent"), value: formatCents(totalSpent, currency) },
    { label: t("stats.largestExpense"), value: formatCents(largest, currency) },
    { label: t("stats.expenses"), value: stats.expenseCount.toString() },
    { label: t("stats.transfers"), value: stats.transferCount.toString() },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="gap-1 p-5">
          <div className="text-sm text-muted-foreground">{kpi.label}</div>
          <div className="text-2xl font-bold tabular-nums">{kpi.value}</div>
        </Card>
      ))}
    </div>
  );
}
