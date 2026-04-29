import { ArrowBigRightDash, ArrowLeftRight, CheckIcon } from "lucide-react";
import { useState } from "react";

import { MemberAvatar } from "@/components/member-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { MemberBalance } from "@/gen/api/v1/group_pb";
import { cn } from "@/lib/utils";

interface TransferFlowProps {
  members: MemberBalance[];
  senderId: string;
  receiverId: string;
  currentUserId: string;
  disabled?: boolean;
  invalid?: boolean;
  onSenderChange: (id: string) => void;
  onReceiverChange: (id: string) => void;
}

export function TransferFlow({
  members,
  senderId,
  receiverId,
  currentUserId,
  disabled,
  invalid,
  onSenderChange,
  onReceiverChange,
}: TransferFlowProps) {
  const [open, setOpen] = useState<"from" | "to" | null>(null);
  const sender = members.find((m) => m.userId === senderId);
  const receiver = members.find((m) => m.userId === receiverId);

  const pick = (side: "from" | "to", id: string) => {
    if (side === "from") {
      if (id === receiverId) onReceiverChange(senderId);
      onSenderChange(id);
    } else {
      if (id === senderId) onSenderChange(receiverId);
      onReceiverChange(id);
    }
    setOpen(null);
  };

  const swap = () => {
    onSenderChange(receiverId);
    onReceiverChange(senderId);
  };

  return (
    <div
      className={cn(
        "relative grid grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)] items-stretch rounded-lg border border-border bg-muted/40 p-1.5 transition-all",
        invalid && "border-destructive ring-4 ring-destructive/15",
      )}
    >
      <Popover open={open === "from"} onOpenChange={(o) => setOpen(o ? "from" : null)}>
        <PartyCard
          label="From"
          member={sender}
          isYou={senderId === currentUserId}
          isOpen={open === "from"}
          disabled={disabled}
        />
        <PopoverContent align="start" side="bottom" sideOffset={8} className="w-72 p-1.5 gap-0">
          <MemberList
            members={members}
            currentUserId={currentUserId}
            selectedId={senderId}
            excludeId={receiverId}
            onPick={(id) => pick("from", id)}
          />
        </PopoverContent>
      </Popover>

      <div className="relative flex items-center justify-center">
        <ArrowBigRightDash className="size-12" />
        <button
          type="button"
          onClick={swap}
          disabled={disabled}
          aria-label="Swap sender and receiver"
          className={cn(
            "absolute left-1/2 -bottom-3 z-[2] flex size-6 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground transition-all",
            "hover:bg-accent hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <ArrowLeftRight className="size-3" strokeWidth={2.2} />
        </button>
      </div>

      <Popover open={open === "to"} onOpenChange={(o) => setOpen(o ? "to" : null)}>
        <PartyCard
          label="To"
          member={receiver}
          isYou={receiverId === currentUserId}
          isOpen={open === "to"}
          disabled={disabled}
        />
        <PopoverContent align="end" side="bottom" sideOffset={8} className="w-72 p-1.5 gap-0">
          <MemberList
            members={members}
            currentUserId={currentUserId}
            selectedId={receiverId}
            excludeId={senderId}
            onPick={(id) => pick("to", id)}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface PartyCardProps {
  label: string;
  member: MemberBalance | undefined;
  isYou: boolean;
  isOpen: boolean;
  disabled?: boolean;
}

function PartyCard({ label, member, isOpen, disabled }: PartyCardProps) {
  return (
    <PopoverTrigger
      render={
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className={cn(
            "group flex flex-col items-center gap-1 rounded-md border border-transparent px-3 py-3.5 transition-all",
            "hover:bg-accent/40",
            "focus-visible:outline-none",
            isOpen && "border-ring bg-background/40 ring-4 ring-ring/20",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          <span className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
          {member ? (
            <>
              <MemberAvatar
                userId={member.userId}
                username={member.userName}
                className="size-14 rounded-full ring-2 ring-card shadow-[0_0_0_1px_var(--border)]"
              />
              <div className="mt-1.5 flex w-full min-w-0 items-center justify-center gap-1.5 text-[15px] font-semibold text-foreground">
                <span className="min-w-0 truncate">{member.userName}</span>
              </div>
            </>
          ) : (
            <div className="my-6 text-sm text-muted-foreground">Choose</div>
          )}
        </button>
      }
    />
  );
}

function YouPill() {
  return (
    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-primary">
      YOU
    </span>
  );
}

interface MemberListProps {
  members: MemberBalance[];
  currentUserId: string;
  selectedId: string;
  excludeId: string;
  onPick: (id: string) => void;
}

function MemberList({ members, currentUserId, selectedId, excludeId, onPick }: MemberListProps) {
  const ordered = [...members].sort((a, b) => {
    const aYou = a.userId === currentUserId ? 1 : 0;
    const bYou = b.userId === currentUserId ? 1 : 0;
    return bYou - aYou;
  });

  return (
    <div className="flex flex-col gap-0.5">
      {ordered.map((m) => {
        const disabled = m.userId === excludeId;
        const isSelected = m.userId === selectedId;
        const isYou = m.userId === currentUserId;
        return (
          <button
            key={m.userId}
            type="button"
            disabled={disabled}
            onClick={() => onPick(m.userId)}
            className={cn(
              "flex w-full items-center gap-3 rounded-sm px-2.5 py-2 text-left transition-all",
              !disabled && !isSelected && "hover:bg-accent",
              isSelected && "bg-primary/15",
              disabled && "cursor-not-allowed opacity-35",
            )}
          >
            <MemberAvatar userId={m.userId} username={m.userName} className="size-8 rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <span className="truncate">{m.userName}</span>
                {isYou && <YouPill />}
              </div>
            </div>
            {isSelected && <CheckIcon className="size-4 shrink-0 text-primary" strokeWidth={2.5} />}
          </button>
        );
      })}
    </div>
  );
}
