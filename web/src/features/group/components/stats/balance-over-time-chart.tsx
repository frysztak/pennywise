import { timestampDate } from "@bufbuild/protobuf/wkt";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import type { GetGroupStatsResponse } from "@/gen/api/v1/group_pb";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/shared/components/ui/chart";

import { centsToNumber, chartColor, formatCompact } from "./format";

interface BalanceOverTimeChartProps {
  series: GetGroupStatsResponse["balanceOverTime"];
  members: { userId: string; userName: string }[];
  currency: string;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const tooltipDateFormatter = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });

export function BalanceOverTimeChart({ series, members, currency }: BalanceOverTimeChartProps) {
  const currencySeries = series.find((s) => s.currency === currency);
  const points = currencySeries?.points ?? [];

  // Only chart members who have non-zero balance at some point, to reduce clutter.
  const activeMembers = members.filter((m) => points.some((p) => (p.balances[m.userId] ?? 0n) !== 0n));

  const data = points.map((p) => {
    const row: Record<string, number> = {
      ts: p.date ? timestampDate(p.date).getTime() : 0,
    };
    for (const m of activeMembers) {
      row[m.userId] = centsToNumber(p.balances[m.userId] ?? 0n);
    }
    return row;
  });

  const chartConfig: ChartConfig = Object.fromEntries(
    activeMembers.map((m, i) => [m.userId, { label: m.userName, color: chartColor(i) }]),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Balance over time</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 || activeMembers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No activity in {currency} yet.</p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[320px] w-full">
            <LineChart accessibilityLayer data={data} margin={{ left: 8, right: 16, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={(ts) => dateFormatter.format(new Date(ts))}
              />
              <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v) => formatCompact(v * 100)} />
              <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 4" />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const ts = payload?.[0]?.payload?.ts;
                      return ts ? tooltipDateFormatter.format(new Date(ts)) : "";
                    }}
                    formatter={(value, name) =>
                      `${chartConfig[String(name)]?.label ?? name}: ${Number(value).toFixed(2)} ${currency}`
                    }
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {activeMembers.map((m) => (
                <Line
                  key={m.userId}
                  type="monotone"
                  dataKey={m.userId}
                  stroke={`var(--color-${m.userId})`}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
