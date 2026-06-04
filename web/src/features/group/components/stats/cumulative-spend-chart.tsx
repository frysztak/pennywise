import { timestampDate } from "@bufbuild/protobuf/wkt";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import type { GetGroupStatsResponse } from "@/gen/api/v1/group_pb";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/shared/components/ui/chart";

import { centsToNumber, formatCompact } from "./format";

interface CumulativeSpendChartProps {
  series: GetGroupStatsResponse["cumulativeSpending"];
  currency: string;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const tooltipDateFormatter = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });

export function CumulativeSpendChart({ series, currency }: CumulativeSpendChartProps) {
  const currencySeries = series.find((s) => s.currency === currency);
  const points = currencySeries?.points ?? [];

  const data = points.map((p) => ({
    ts: p.date ? timestampDate(p.date).getTime() : 0,
    total: centsToNumber(p.total),
  }));

  const chartConfig = {
    total: { label: "Total spent", color: "var(--chart-1)" },
  } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cumulative spending</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No expenses in {currency} yet.</p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
            <AreaChart accessibilityLayer data={data} margin={{ left: 8, right: 16, top: 8 }}>
              <defs>
                <linearGradient id="fillCumulativeSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-total)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--color-total)" stopOpacity={0.1} />
                </linearGradient>
              </defs>
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
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const ts = payload?.[0]?.payload?.ts;
                      return ts ? tooltipDateFormatter.format(new Date(ts)) : "";
                    }}
                    formatter={(value) => `Total spent: ${Number(value).toFixed(2)} ${currency}`}
                  />
                }
              />
              <Area
                dataKey="total"
                type="monotone"
                stroke="var(--color-total)"
                strokeWidth={2}
                fill="url(#fillCumulativeSpend)"
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
