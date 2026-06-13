import i18n from "@/i18n";

// Locale-aware formatting helpers. They default to the active i18next language
// so dates and numbers follow the user's selected locale.

export function formatDate(date: Date | string, locale: string = i18n.language): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

// Formats an amount as a locale-aware number followed by the ISO currency code
// (e.g. "1,234.50 USD"). We deliberately keep the ISO code rather than a currency
// symbol to stay consistent with how currencies are shown elsewhere in the app.
export function formatCurrency(amount: number, currency: string, locale: string = i18n.language): string {
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${formatted} ${currency}`;
}
