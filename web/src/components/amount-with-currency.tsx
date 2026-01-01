import { cn } from "@/lib/utils";

interface AmountWithCurrencyProps {
  balance: Record<string, bigint> | Array<{ amount: bigint; currency: string }>;
  disableColor?: boolean;
  className?: string;
  defaultCurrency?: string;
}

export function AmountWithCurrency({
  balance,
  disableColor = false,
  className,
  defaultCurrency,
}: AmountWithCurrencyProps) {
  // Convert to array format if needed
  const balanceArray = Array.isArray(balance)
    ? balance
    : Object.entries(balance).map(([currency, amount]) => ({
        amount,
        currency,
      }));

  if (balanceArray.length === 0) {
    return <span className={className}>—</span>;
  }

  // Sort balance array: defaultCurrency first, then others
  const sortedBalance = defaultCurrency
    ? [...balanceArray].sort((a, b) => {
        if (a.currency === defaultCurrency) return -1;
        if (b.currency === defaultCurrency) return 1;
        return 0;
      })
    : balanceArray;

  return (
    <span className={className}>
      {sortedBalance.map((item, index) => {
        const amount = Number(item.amount) / 100;
        const isNegative = item.amount < 0n;
        const colorClass = !disableColor
          ? isNegative
            ? "text-negative-money"
            : "text-money"
          : "";

        return (
          <span key={index}>
            {index > 0 && <span className="text-muted-foreground"> / </span>}
            <span className={cn(colorClass, className)}>
              {amount.toFixed(2)}&nbsp;{item.currency}
            </span>
          </span>
        );
      })}
    </span>
  );
}
