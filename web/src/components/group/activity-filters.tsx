import { ActivityTypeFilter } from "@/gen/api/v1/group_pb";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const typeValue =
    typeFilter === ActivityTypeFilter.EXPENSE
      ? "expense"
      : typeFilter === ActivityTypeFilter.TRANSFER
        ? "transfer"
        : ALL;

  const typeItems = [
    { value: ALL, label: "All types" },
    { value: "expense", label: "Expenses" },
    { value: "transfer", label: "Transfers" },
  ];

  const currencyItems = [
    { value: ALL, label: "All currencies" },
    ...currencies.map((c) => ({ value: c, label: c })),
  ];

  const memberItems = [
    { value: ALL, label: "All members" },
    ...members.map((m) => ({ value: m.id, label: m.name })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      <Select
        items={typeItems}
        value={typeValue}
        onValueChange={(v) =>
          onChange({
            typeFilter:
              v === "expense"
                ? ActivityTypeFilter.EXPENSE
                : v === "transfer"
                  ? ActivityTypeFilter.TRANSFER
                  : ActivityTypeFilter.UNSPECIFIED,
          })
        }
      >
        <SelectTrigger size="sm">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All types</SelectItem>
          <SelectItem value="expense">Expenses</SelectItem>
          <SelectItem value="transfer">Transfers</SelectItem>
        </SelectContent>
      </Select>

      {currencies.length > 1 && (
        <Select
          items={currencyItems}
          value={currencyFilter ?? ALL}
          onValueChange={(v) => onChange({ currencyFilter: v == null || v === ALL ? undefined : v })}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="All currencies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All currencies</SelectItem>
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
            <SelectValue placeholder="All members" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All members</SelectItem>
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
