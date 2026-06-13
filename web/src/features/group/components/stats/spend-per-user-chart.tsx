import { useTranslation } from "react-i18next";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";

import type { GetGroupStatsResponse } from "@/gen/api/v1/group_pb";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/shared/components/ui/chart";

import { centsToNumber, chartColor, formatCompact } from "./format";

interface SpendPerUserChartProps {
  memberSpending: GetGroupStatsResponse["memberSpending"];
  currency: string;
}

export function SpendPerUserChart({ memberSpending, currency }: SpendPerUserChartProps) {
  const { t } = useTranslation();
  const data = memberSpending
    .map((m) => ({
      name: m.userName,
      paid: centsToNumber(m.paid[currency] ?? 0n),
    }))
    .filter((d) => d.paid > 0)
    .sort((a, b) => b.paid - a.paid);

  const chartConfig = {
    paid: { label: "Paid" },
  } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("stats.paidPerMember")}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("stats.noExpenses", { currency })}</p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
            <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" dataKey="paid" tickFormatter={(v) => formatCompact(v * 100)} hide />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={80} tickMargin={8} />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent formatter={(value) => `${Number(value).toFixed(2)} ${currency}`} />}
              />
              <Bar dataKey="paid" radius={4}>
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={chartColor(index)} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
