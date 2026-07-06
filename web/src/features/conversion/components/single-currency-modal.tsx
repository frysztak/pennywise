import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { createConnectQueryKey, useMutation } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { createConversions, getExchangeRates } from "@/gen/api/v1/conversion-ConversionService_connectquery";
import {
  getGroupActivity,
  getSettlementSuggestions,
  getUserGroups,
} from "@/gen/api/v1/group-GroupService_connectquery";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Field, FieldLabel } from "@/shared/components/ui/field";
import { Input } from "@/shared/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/shared/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Spinner } from "@/shared/components/ui/spinner";
import { handleError } from "@/shared/lib/utils";

interface SingleCurrencyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  // Currencies that currently have a balance in the group (need folding).
  currenciesInGroup: string[];
  // All group currencies (target selector options).
  currencies: string[];
  defaultCurrency: string;
}

const getTodayDateString = (): string => new Date().toISOString().split("T")[0];

const userGroupsKey = createConnectQueryKey({ schema: getUserGroups, cardinality: "finite" });
const settlementSuggestionsKey = createConnectQueryKey({ schema: getSettlementSuggestions, cardinality: "finite" });

export function SingleCurrencyModal({
  open,
  onOpenChange,
  groupId,
  currenciesInGroup,
  currencies,
  defaultCurrency,
}: SingleCurrencyModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // This modal is mounted fresh each time it opens (see SettlementSuggestions),
  // so initializing state from props here is enough — no reset effect needed.
  const [target, setTarget] = useState(defaultCurrency);
  const [date, setDate] = useState(getTodayDateString());
  const [rates, setRates] = useState<Record<string, number>>(() =>
    Object.fromEntries(currenciesInGroup.map((c) => [c, 1])),
  );

  const sources = useMemo(() => currenciesInGroup.filter((c) => c !== target), [currenciesInGroup, target]);

  const targetItems = useMemo(() => currencies.map((c) => ({ value: c, label: c })), [currencies]);

  const groupActivityKey = createConnectQueryKey({
    schema: getGroupActivity,
    cardinality: "finite",
    input: { groupId },
  });

  const { mutate: fetchRates, isPending: isFetchingRates } = useMutation(getExchangeRates, {
    onSuccess: (res) => {
      setRates((r) => {
        const next = { ...r };
        for (const rate of res.rates) next[rate.fromCurrency] = rate.rate;
        return next;
      });
      // The provider omits pairs it couldn't resolve; flag if any were dropped.
      if (res.rates.length < sources.length) toast.info(t("conversion.rateFetchFailed"));
    },
    onError: () => toast.info(t("conversion.rateFetchFailed")),
  });

  const fetchAllRates = () => {
    fetchRates({
      toCurrency: target,
      fromCurrencies: sources,
      date: timestampFromDate(new Date(date)),
    });
  };

  const { mutate: createMutate, isPending: isSubmitting } = useMutation(createConversions, {
    onSuccess: () => {
      toast.success(t("conversion.singleCurrency.done", { currency: target }));
      queryClient.invalidateQueries({ queryKey: groupActivityKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      queryClient.invalidateQueries({ queryKey: settlementSuggestionsKey });
      onOpenChange(false);
    },
    onError: handleError,
  });

  const handleConfirm = () => {
    if (sources.length === 0) {
      onOpenChange(false);
      return;
    }
    const ts = timestampFromDate(new Date(date));
    createMutate({
      groupId,
      toCurrency: target,
      conversions: sources.map((src) => ({
        fromCurrency: src,
        rate: rates[src] ?? 1,
        date: ts,
      })),
    });
  };

  const ratesValid = sources.every((src) => {
    const r = rates[src];
    return typeof r === "number" && r > 0 && !Number.isNaN(r);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("conversion.singleCurrency.title")}</DialogTitle>
          <DialogDescription>{t("conversion.singleCurrency.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="targetCurrency">{t("conversion.singleCurrency.target")}</FieldLabel>
              <Select items={targetItems} value={target} onValueChange={(v) => v && setTarget(v)}>
                <SelectTrigger id="targetCurrency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {targetItems.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="rateDate">{t("conversion.singleCurrency.rateDate")}</FieldLabel>
              <Input id="rateDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("conversion.singleCurrency.nothingToConvert")}</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("conversion.singleCurrency.rates")}</span>
                <Button type="button" variant="outline" size="sm" onClick={fetchAllRates} disabled={isFetchingRates}>
                  {isFetchingRates ? <Spinner /> : <RefreshCw />}
                  {t("conversion.singleCurrency.fetchAll")}
                </Button>
              </div>
              <div className="flex flex-col gap-3">
                {sources.map((src) => (
                  <div key={src} className="flex items-center gap-3">
                    <span className="text-sm font-medium whitespace-nowrap tabular-nums">1 {src} =</span>
                    <InputGroup className="flex-1">
                      <InputGroupInput
                        id={`rate-${src}`}
                        type="number"
                        step="any"
                        min="0"
                        inputMode="decimal"
                        disabled={isFetchingRates}
                        aria-label={`1 ${src} = ${target}`}
                        value={Number.isNaN(rates[src]) ? "" : (rates[src] ?? "")}
                        onChange={(e) =>
                          setRates((r) => ({
                            ...r,
                            [src]: e.target.value === "" ? Number.NaN : e.target.valueAsNumber,
                          }))
                        }
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>{target}</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleConfirm} disabled={isSubmitting || !ratesValid} size="lg">
            {isSubmitting ? <Spinner /> : <ArrowRightLeft />}
            {t("conversion.singleCurrency.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
