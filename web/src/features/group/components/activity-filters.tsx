import { useTranslation } from "react-i18next";

import { ActivityTypeFilter } from "@/gen/api/v1/group_pb";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";

export interface ActivityFiltersState {
  typeFilter?: ActivityTypeFilter;
  currencyFilter?: string;
  memberFilter?: string;
}

interface ActivityFiltersProps extends ActivityFiltersState {
  currencies: string[];
  members: { id: string; name: string }[];
  onChange: (next: Partial<ActivityFiltersState>) => void;
}

const ALL = "__all__";

export function ActivityFilters({
  typeFilter,
  currencyFilter,
  memberFilter,
  currencies,
  members,
  onChange,
}: ActivityFiltersProps) {
  const { t } = useTranslation();
  const typeValue =
    typeFilter === ActivityTypeFilter.EXPENSE
      ? "expense"
      : typeFilter === ActivityTypeFilter.TRANSFER
        ? "transfer"
        : typeFilter === ActivityTypeFilter.CONVERSION
          ? "conversion"
          : ALL;

  const typeItems = [
    { value: ALL, label: t("activity.filter.allTypes") },
    { value: "expense", label: t("activity.filter.expenses") },
    { value: "transfer", label: t("activity.filter.transfers") },
    { value: "conversion", label: t("activity.filter.conversions") },
  ];

  const typeFilterFromValue = (v: string): ActivityTypeFilter => {
    switch (v) {
      case "expense":
        return ActivityTypeFilter.EXPENSE;
      case "transfer":
        return ActivityTypeFilter.TRANSFER;
      case "conversion":
        return ActivityTypeFilter.CONVERSION;
      default:
        return ActivityTypeFilter.UNSPECIFIED;
    }
  };

  const currencyItems = [
    { value: ALL, label: t("activity.filter.allCurrencies") },
    ...currencies.map((c) => ({ value: c, label: c })),
  ];

  const memberItems = [
    { value: ALL, label: t("activity.filter.allMembers") },
    ...members.map((m) => ({ value: m.id, label: m.name })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      <Select
        items={typeItems}
        value={typeValue}
        onValueChange={(v) => onChange({ typeFilter: typeFilterFromValue(v ?? "") })}
      >
        <SelectTrigger size="sm">
          <SelectValue placeholder={t("activity.filter.allTypes")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("activity.filter.allTypes")}</SelectItem>
          <SelectItem value="expense">{t("activity.filter.expenses")}</SelectItem>
          <SelectItem value="transfer">{t("activity.filter.transfers")}</SelectItem>
          <SelectItem value="conversion">{t("activity.filter.conversions")}</SelectItem>
        </SelectContent>
      </Select>

      {currencies.length > 1 && (
        <Select
          items={currencyItems}
          value={currencyFilter ?? ALL}
          onValueChange={(v) => onChange({ currencyFilter: v == null || v === ALL ? undefined : v })}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder={t("activity.filter.allCurrencies")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("activity.filter.allCurrencies")}</SelectItem>
            {currencies.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {members.length > 0 && (
        <Select
          items={memberItems}
          value={memberFilter ?? ALL}
          onValueChange={(v) => onChange({ memberFilter: v == null || v === ALL ? undefined : v })}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder={t("activity.filter.allMembers")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("activity.filter.allMembers")}</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
