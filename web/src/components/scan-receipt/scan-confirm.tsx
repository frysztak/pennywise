import { Layers, Receipt, Users } from "lucide-react";
import * as React from "react";

import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { UserGroup } from "@/gen/api/v1/group_pb";
import { cn } from "@/lib/utils";

import { fmtDate, fmtMoney } from "./scan-review";
import type { ReceiptDraft } from "./types";

export type SaveMode = "single" | "multiple";

export interface ConfirmState {
  groupId: string;
  payerId: string;
  includedIds: Set<string>;
  mode: SaveMode;
}

export function ScanConfirm({
  draft,
  groups,
  currentUserId,
  state,
  onChange,
}: {
  draft: ReceiptDraft;
  groups: UserGroup[];
  currentUserId: string;
  state: ConfirmState;
  onChange: (next: ConfirmState) => void;
}) {
  const selected = draft.items.filter((i) => i.selected);
  const total = selected.reduce((s, i) => s + i.price, 0);

  const group = groups.find((g) => g.groupId === state.groupId);
  const members = group?.memberBalances ?? [];

  const includedCount = Math.max(state.includedIds.size, 1);
  const perHead = total / includedCount;

  const setMode = (mode: SaveMode) => onChange({ ...state, mode });

  const setGroupId = (groupId: string) => {
    const g = groups.find((x) => x.groupId === groupId);
    if (!g) return;
    const memberIds = g.memberBalances.map((m) => m.userId);
    const payerId = memberIds.includes(currentUserId) ? currentUserId : (memberIds[0] ?? "");
    onChange({ ...state, groupId, payerId, includedIds: new Set(memberIds) });
  };

  const toggleIncluded = (userId: string) => {
    const next = new Set(state.includedIds);
    if (next.has(userId)) {
      if (userId === state.payerId || next.size <= 1) return;
      next.delete(userId);
    } else {
      next.add(userId);
    }
    onChange({ ...state, includedIds: next });
  };

  const setPayer = (userId: string) => {
    const next = new Set(state.includedIds);
    next.add(userId);
    onChange({ ...state, payerId: userId, includedIds: next });
  };

  return (
    <div className="grid md:min-h-[480px] md:grid-cols-2">
      {/* Left: summary + mode + group/date */}
      <div className="flex flex-col gap-4 overflow-y-auto border-b p-4 md:border-r md:border-b-0 md:p-6">
        <div className="bg-muted/30 flex items-center gap-3 rounded-lg border p-4">
          <div className="bg-primary/10 text-primary flex size-12 shrink-0 items-center justify-center rounded-md">
            <Receipt className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">{draft.merchant || "Untitled receipt"}</div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              {selected.length} {selected.length === 1 ? "item" : "items"} · {fmtDate(draft.date)}
            </div>
          </div>
          <div className="font-mono text-lg font-semibold tabular-nums">{fmtMoney(total, draft.currency)}</div>
        </div>

        <div>
          <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">Create as</div>
          <div className="flex flex-col gap-2">
            <ModeOption
              active={state.mode === "single"}
              onClick={() => setMode("single")}
              icon={<Receipt className="size-4" />}
              title="One expense"
              body={`A single ${draft.merchant || "receipt"} expense for ${fmtMoney(total, draft.currency)}.`}
            />
            <ModeOption
              active={state.mode === "multiple"}
              onClick={() => setMode("multiple")}
              icon={<Layers className="size-4" />}
              title={`${selected.length} separate expenses`}
              body="One expense per line item."
            />
          </div>
        </div>

        <div>
          <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
            {state.mode === "multiple" ? "Applied to all expenses" : "Expense details"}
          </div>
          <div className="bg-card flex flex-col gap-px overflow-hidden rounded-lg border">
            <MetaRow label="Group" icon={<Users className="text-muted-foreground size-4" />}>
              {groups.length === 0 ? (
                <span className="text-muted-foreground text-sm">No groups available</span>
              ) : (
                <Select
                  items={groups.map((g) => ({ value: g.groupId, label: g.groupName }))}
                  value={state.groupId}
                  onValueChange={(v) => v && setGroupId(v)}
                >
                  <SelectTrigger className="h-8 border-transparent bg-transparent px-2 text-sm font-medium shadow-none">
                    <SelectValue placeholder="Select group" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectItem key={g.groupId} value={g.groupId}>
                        {g.groupName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </MetaRow>
            <MetaRow label="Date">
              <span className="text-sm font-medium">{fmtDate(draft.date)}</span>
            </MetaRow>
          </div>
        </div>

        {state.mode === "multiple" && (
          <div>
            <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
              You'll create
            </div>
            <div className="bg-muted/30 max-h-44 overflow-y-auto rounded-lg border p-1.5">
              {selected.map((it) => (
                <div key={it.id} className="flex items-center gap-3 px-2.5 py-2">
                  <div className="flex-1 truncate text-sm font-medium">{it.name || "(unnamed)"}</div>
                  <div className="font-mono text-sm tabular-nums">{fmtMoney(it.price, draft.currency)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: people + split */}
      <div className="flex flex-col gap-4 overflow-y-auto p-4 md:p-6">
        <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">People</div>
        {members.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
            Pick a group to choose who pays and who shares this expense.
          </div>
        ) : (
          <div className="bg-card overflow-hidden rounded-lg border">
            {members.map((m, i) => {
              const isIncluded = state.includedIds.has(m.userId);
              const isPayer = state.payerId === m.userId;
              return (
                <div
                  key={m.userId}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleIncluded(m.userId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleIncluded(m.userId);
                    }
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left transition-colors outline-none",
                    "focus-visible:bg-muted/60",
                    i > 0 && "border-t",
                    isPayer && "bg-primary/10",
                    !isIncluded && "opacity-50",
                  )}
                >
                  <MemberAvatar userId={m.userId} username={m.userName} className="size-8" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{m.userName}</span>
                      {isPayer && (
                        <span className="bg-primary/15 text-primary rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
                          Paid
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-0.5 font-mono text-xs tabular-nums">
                      {isIncluded ? `owes ${fmtMoney(perHead, draft.currency)}` : "not included"}
                    </div>
                  </div>
                  <Button
                    variant={isPayer ? "secondary" : "outline"}
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPayer(m.userId);
                    }}
                    className="rounded-full"
                  >
                    {isPayer ? "✓ Payer" : "Set as payer"}
                  </Button>
                  <div
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded border-[1.5px]",
                      isIncluded ? "border-primary bg-primary text-primary-foreground" : "border-input bg-transparent",
                    )}
                  >
                    {isIncluded && (
                      <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="4 12 10 18 20 6" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-muted-foreground text-xs leading-relaxed">
          Click a row to toggle who's included in the split. Click{" "}
          <span className="text-foreground/80">Set as payer</span> to change who paid.
        </div>
      </div>
    </div>
  );
}

function ModeOption({
  active,
  onClick,
  icon,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-lg border-[1.5px] p-3.5 text-left transition-colors",
        active ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted/40",
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px]",
          active ? "border-primary bg-primary" : "border-input",
        )}
      >
        {active && <div className="bg-primary-foreground size-2 rounded-full" />}
      </div>
      <div className={cn("mt-0.5 shrink-0", active ? "text-primary" : "text-muted-foreground")}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-muted-foreground mt-0.5 text-xs leading-snug">{body}</div>
      </div>
    </button>
  );
}

function MetaRow({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card flex items-center gap-3 px-3.5 py-2.5">
      {icon && <div className="flex w-5 shrink-0 items-center">{icon}</div>}
      <div className="text-muted-foreground min-w-16 text-sm font-medium">{label}</div>
      <div className="flex flex-1 justify-end">{children}</div>
    </div>
  );
}

export function ScanConfirmFooter({
  draft,
  state,
  onBack,
  onCancel,
  onSave,
  saving,
  canSave,
}: {
  draft: ReceiptDraft;
  state: ConfirmState;
  onBack: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  canSave: boolean;
}) {
  const selected = draft.items.filter((i) => i.selected);
  const total = selected.reduce((s, i) => s + i.price, 0);
  const label =
    state.mode === "single"
      ? `Save expense · ${fmtMoney(total, draft.currency)}`
      : `Save ${selected.length} expense${selected.length === 1 ? "" : "s"}`;

  return (
    <div className="bg-card flex flex-col-reverse gap-3 border-t px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6 md:py-3.5">
      <Button variant="outline" onClick={onBack} className="md:flex-initial">
        Back to review
      </Button>
      <div className="flex gap-2.5">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={!canSave || saving} className="min-w-52">
          {saving && <Spinner />}
          {label}
        </Button>
      </div>
    </div>
  );
}
