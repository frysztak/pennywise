// Convert integer cents (as bigint or number) to a major-unit number.
export function centsToNumber(cents: bigint | number): number {
  return Number(cents) / 100;
}

// Format integer cents for axis ticks and tooltips, e.g. "12.34 USD".
export function formatCents(cents: bigint | number, currency: string): string {
  return `${centsToNumber(cents).toFixed(2)} ${currency}`;
}

// Compact axis tick (no currency), e.g. "1.2k".
export function formatCompact(cents: bigint | number): string {
  const value = centsToNumber(cents);
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

// Chart colors cycle through the five theme tokens.
export function chartColor(index: number): string {
  return `var(--chart-${(index % 5) + 1})`;
}
