import { format, parseISO } from "date-fns";
import { ArrowRight, Plus, Sparkles, TriangleAlert } from "lucide-react";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { ItemDraft, ReceiptDraft } from "./types";

const fmtMoney = (n: number, currency: string) => `${n.toFixed(2)} ${currency}`;
const fmtDate = (iso: string) => format(parseISO(iso), "MMM d, yyyy");

const newItemId = () => `new-${Math.random().toString(36).slice(2, 8)}`;

export function ScanReview({
  draft,
  setDraft,
  imageUrl,
}: {
  draft: ReceiptDraft;
  setDraft: (d: ReceiptDraft) => void;
  imageUrl: string | null;
}) {
  const allSelected = draft.items.length > 0 && draft.items.every((i) => i.selected);
  const selectedItems = draft.items.filter((i) => i.selected);
  const lowConfidenceCount = draft.items.filter((i) => i.confidence < 0.92).length;

  const toggle = (id: string) =>
    setDraft({
      ...draft,
      items: draft.items.map((it) => (it.id === id ? { ...it, selected: !it.selected } : it)),
    });

  const selectAll = () => setDraft({ ...draft, items: draft.items.map((i) => ({ ...i, selected: !allSelected })) });

  const updateItem = (id: string, patch: Partial<ItemDraft>) =>
    setDraft({ ...draft, items: draft.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });

  const addItem = () =>
    setDraft({
      ...draft,
      items: [...draft.items, { id: newItemId(), name: "", qty: 1, price: 0, confidence: 1, selected: true }],
    });

  return (
    <div className="grid md:min-h-120 md:grid-cols-[0.85fr_1.15fr]">
      {/* Left: original photo */}
      <div className="bg-muted/30 flex flex-col gap-3 overflow-hidden border-b p-4 md:border-r md:border-b-0 md:p-6">
        <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Original</div>
        <div className="flex flex-1 items-center justify-center overflow-hidden">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Receipt"
              className="border-border max-h-105 max-w-full rounded-md border shadow-md"
            />
          ) : (
            <div className="text-muted-foreground text-sm">No image preview</div>
          )}
        </div>
        <div className="bg-background/60 text-muted-foreground flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
          <Sparkles className="text-primary mt-0.5 size-3 shrink-0" />
          <div className="flex flex-col gap-0.5 md:flex-row md:gap-1">
            <span>Click any field below to edit.</span>
            <span>
              <span className="text-foreground/80">{draft.items.length} items</span> extracted.
            </span>
          </div>
        </div>
      </div>

      {/* Right: editable data */}
      <div className="flex flex-col gap-4 overflow-y-auto p-4 md:p-6">
        {lowConfidenceCount > 0 && (
          <Alert>
            <TriangleAlert />
            <AlertTitle>Partial extraction</AlertTitle>
            <AlertDescription>
              {lowConfidenceCount} {lowConfidenceCount === 1 ? "item has" : "items have"} low confidence. Review the
              flagged rows before saving.
            </AlertDescription>
          </Alert>
        )}

        {/* Header card: merchant, date, total */}
        <div className="bg-muted/30 grid gap-3 rounded-lg border p-4 sm:grid-cols-[1.6fr_1fr_1fr]">
          <FieldGroup label="Merchant">
            <Input value={draft.merchant} onChange={(e) => setDraft({ ...draft, merchant: e.target.value })} />
          </FieldGroup>
          <FieldGroup label="Date">
            <Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          </FieldGroup>
          <FieldGroup label="Total">
            <div className="border-input bg-muted/40 text-foreground/80 flex h-9 items-center justify-end rounded-md border px-3 font-mono text-sm tabular-nums">
              {draft.total.toFixed(2)} {draft.currency}
            </div>
          </FieldGroup>
        </div>

        {/* Items */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Line items</div>
            <button
              type="button"
              onClick={selectAll}
              className="text-primary cursor-pointer text-xs font-medium hover:underline"
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          </div>
          <div className="bg-card overflow-hidden rounded-lg border">
            <div className="bg-muted text-muted-foreground hidden grid-cols-[28px_1fr_56px_88px_88px] items-center gap-2 border-b px-3 py-2 text-[10.5px] font-semibold tracking-wider uppercase md:grid">
              <span />
              <span>Item</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Unit</span>
              <span className="text-right">Total</span>
            </div>
            {draft.items.map((it, i) => (
              <ItemRow
                key={it.id}
                item={it}
                currency={draft.currency}
                isLast={i === draft.items.length - 1}
                onToggle={() => toggle(it.id)}
                onChange={(patch) => updateItem(it.id, patch)}
              />
            ))}
            <button
              type="button"
              onClick={addItem}
              className="text-muted-foreground hover:bg-muted/50 hover:text-foreground flex w-full cursor-pointer items-center justify-center gap-1.5 border-t px-3 py-2.5 text-xs font-medium transition-colors"
            >
              <Plus className="size-3.5" /> Add line item
            </button>
          </div>
        </div>

        {/* Totals */}
        <div className="bg-muted/30 flex flex-col gap-2 rounded-lg border p-4">
          <Row label="Selected items" value={`${selectedItems.length} of ${draft.items.length}`} />
          <Row
            label="Selected total"
            value={fmtMoney(
              selectedItems.reduce((s, i) => s + i.price, 0),
              draft.currency,
            )}
          />
          <div className="bg-border my-1 h-px" />
          <Row label="Receipt total" value={fmtMoney(draft.total, draft.currency)} bold />
        </div>
      </div>
    </div>
  );
}

function MoneyInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  const [focused, setFocused] = React.useState(false);
  const [raw, setRaw] = React.useState(() => value.toString());
  React.useEffect(() => {
    if (!focused) setRaw(value.toFixed(2));
  }, [value, focused]);
  return (
    <Input
      type="text"
      inputMode="decimal"
      className={className}
      value={raw}
      onFocus={() => {
        setFocused(true);
        setRaw(value === 0 ? "" : String(value));
      }}
      onBlur={() => {
        setFocused(false);
        const n = Number(raw.replace(",", "."));
        const safe = Number.isFinite(n) ? n : 0;
        setRaw(safe.toFixed(2));
        if (safe !== value) onChange(safe);
      }}
      onChange={(e) => {
        setRaw(e.target.value);
        const n = Number(e.target.value.replace(",", "."));
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">{label}</div>
      {children}
    </div>
  );
}

function ItemRow({
  item,
  currency,
  isLast,
  onToggle,
  onChange,
}: {
  item: ItemDraft;
  currency: string;
  isLast: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<ItemDraft>) => void;
}) {
  const lowConf = item.confidence < 0.92;
  const qty = Math.max(item.qty, 1);
  const unit = item.price / qty;

  const inputCls =
    "h-8 border-transparent bg-transparent px-1.5 text-sm shadow-none focus-visible:border-input focus-visible:bg-background";

  return (
    <div
      className={cn(
        "px-3 py-2 transition-colors",
        !isLast && "border-b",
        !item.selected && "bg-muted/40 opacity-60",
        lowConf && "border-l-warning border-l-2",
        // mobile: stacked card; desktop: 5-col grid
        "flex flex-col gap-2 md:grid md:grid-cols-[28px_1fr_56px_88px_88px] md:items-center md:gap-2",
      )}
    >
      {/* Mobile row 1 + desktop col 1+2: checkbox + name + low-conf badge */}
      <div className="flex min-w-0 items-center gap-2 md:contents">
        <Checkbox checked={item.selected} onCheckedChange={onToggle} className="shrink-0" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            value={item.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className={cn(inputCls, "font-medium")}
          />
          {lowConf && (
            <span className="bg-warning/15 text-warning inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase">
              <TriangleAlert className="size-2.5" />
              low
            </span>
          )}
        </div>
      </div>

      {/* Mobile row 2: qty / unit / total with labels. Desktop: 3 separate cells, no labels. */}
      <div className="text-muted-foreground grid grid-cols-3 items-baseline gap-2 pl-7 text-[10px] font-semibold tracking-wider uppercase md:hidden">
        <span>Qty</span>
        <span className="text-right">Unit</span>
        <span className="text-right">Total</span>
      </div>
      <div className="grid grid-cols-3 items-center gap-2 pl-7 md:contents md:pl-0">
        <div className="text-foreground/80 px-1.5 text-right font-mono text-sm tabular-nums">{item.qty}</div>
        <div className="text-muted-foreground text-right font-mono text-sm tabular-nums">
          {unit.toFixed(2)} {currency}
        </div>
        <MoneyInput
          value={item.price}
          onChange={(n) => onChange({ price: n })}
          className={cn(inputCls, "text-right font-mono font-semibold")}
        />
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className={cn("text-muted-foreground", bold && "text-foreground font-medium")}>{label}</span>
      <span className={cn("font-mono tabular-nums", bold && "font-semibold")}>{value}</span>
    </div>
  );
}

export function ScanReviewFooter({
  draft,
  onBack,
  onContinue,
}: {
  draft: ReceiptDraft;
  onBack: () => void;
  onContinue: () => void;
}) {
  const selectedItems = draft.items.filter((i) => i.selected);
  const selectedSum = selectedItems.reduce((s, i) => s + i.price, 0);

  return (
    <div className="bg-card flex flex-col-reverse gap-3 border-t px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6 md:py-3.5">
      <div className="flex items-baseline gap-3">
        <span className="text-muted-foreground text-xs">
          {selectedItems.length} of {draft.items.length} item{draft.items.length === 1 ? "" : "s"} selected
        </span>
        <span className="font-mono text-base font-semibold tabular-nums">{fmtMoney(selectedSum, draft.currency)}</span>
      </div>
      <div className="flex gap-2.5">
        <Button variant="outline" onClick={onBack} className="flex-1 md:flex-initial">
          Back
        </Button>
        <Button disabled={selectedItems.length === 0} onClick={onContinue} className="flex-1 md:flex-initial">
          Continue <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

export { fmtDate, fmtMoney };
