import { CheckIcon } from "lucide-react";

import { MemberAvatar } from "@/components/member-avatar";
import { cn, formatCurrency } from "@/lib/utils";

import type { MemberBalance } from "@/gen/api/v1/group_pb";

export interface PeopleSelectorProps {
  members: MemberBalance[];
  payerId: string;
  beneficiaryIds: string[];
  totalAmount: number;
  currency: string;
  currentUserId: string;
  disabled?: boolean;
  onPayerChange: (id: string) => void;
  onBeneficiariesChange: (ids: string[]) => void;
}

export function PeopleSelector({
  members,
  payerId,
  beneficiaryIds,
  totalAmount,
  currency,
  currentUserId,
  disabled,
  onPayerChange,
  onBeneficiariesChange,
}: PeopleSelectorProps) {
  const includedSet = new Set(beneficiaryIds);
  const includedWeightSum = members
    .filter((m) => includedSet.has(m.userId))
    .reduce((sum, m) => sum + m.weight, 0) || 1;

  const toggleIncluded = (id: string) => {
    if (disabled) return;
    if (id === payerId) return;
    if (includedSet.has(id)) {
      if (includedSet.size <= 1) return;
      onBeneficiariesChange(beneficiaryIds.filter((x) => x !== id));
    } else {
      onBeneficiariesChange([...beneficiaryIds, id]);
    }
  };

  const setPayer = (id: string) => {
    if (disabled) return;
    onPayerChange(id);
    if (!includedSet.has(id)) {
      onBeneficiariesChange([...beneficiaryIds, id]);
    }
  };

  return (
    <div>
      <div className="text-sm font-semibold mb-2">People</div>
      <div className="bg-muted/40 border border-border rounded-lg overflow-hidden">
        {members.map((member, i) => {
          const isIncluded = includedSet.has(member.userId);
          const isPayer = member.userId === payerId;
          const isCurrentUser = member.userId === currentUserId;
          const share = isIncluded ? (totalAmount * member.weight) / includedWeightSum : 0;
          return (
            <div
              key={member.userId}
              role="checkbox"
              aria-checked={isIncluded}
              tabIndex={disabled ? -1 : 0}
              onClick={() => toggleIncluded(member.userId)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  toggleIncluded(member.userId);
                }
              }}
              className={cn(
                "flex items-center gap-3 px-3.5 py-3 select-none transition-all",
                i > 0 && "border-t border-border/50",
                isPayer ? "cursor-default" : "cursor-pointer hover:bg-accent/40",
                !isIncluded && "opacity-55",
                disabled && "cursor-not-allowed",
              )}
            >
              <MemberAvatar
                userId={member.userId}
                username={member.userName}
                className={cn(
                  "size-8 rounded-full transition-all",
                  !isIncluded && "grayscale brightness-75",
                )}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span className="truncate">{member.userName}</span>
                  {isCurrentUser && (
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      You
                    </span>
                  )}
                </div>
                {isIncluded && (
                  <div className="text-xs text-muted-foreground font-mono tabular-nums mt-0.5">
                    owes {formatCurrency(share, currency)}
                  </div>
                )}
              </div>

              <button
                type="button"
                aria-pressed={isPayer}
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  setPayer(member.userId);
                }}
                className={cn(
                  "shrink-0 min-w-20 px-2.5 py-1 rounded-full border text-[11.5px] font-medium whitespace-nowrap transition-all",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  isPayer
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
                )}
              >
                {isPayer ? (
                  <span className="inline-flex items-center gap-1">
                    <CheckIcon className="size-3" />
                    Payer
                  </span>
                ) : (
                  "Set payer"
                )}
              </button>

              <div
                aria-hidden="true"
                className={cn(
                  "size-5 rounded-md border-[1.5px] flex items-center justify-center shrink-0 transition-all",
                  isIncluded ? "bg-primary border-primary" : "border-border",
                )}
              >
                {isIncluded && (
                  <CheckIcon
                    className="size-3 text-primary-foreground"
                    strokeWidth={3.5}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11.5px] text-muted-foreground mt-2 leading-relaxed">
        Tap a row to toggle who's included. Use{" "}
        <span className="text-foreground/80">Set payer</span> to choose who paid.
      </p>
    </div>
  );
}
