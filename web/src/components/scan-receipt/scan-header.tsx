import { Check, Receipt, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { STEPS } from "./types";

export function ScanHeader({
  step,
  title,
  subtitle,
  onClose,
}: {
  step: number;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b px-4 py-3 md:px-6 md:py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Receipt className="size-4 md:size-5" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold leading-tight">{title}</div>
          {subtitle && <div className="text-muted-foreground mt-0.5 hidden text-xs md:block">{subtitle}</div>}
        </div>
      </div>

      <Stepper current={step} className="hidden md:flex" />

      <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" className="md:invisible">
        <X />
      </Button>
    </div>
  );
}

function Stepper({ current, className }: { current: number; className?: string }) {
  return (
    <div className={cn("flex items-center", className)}>
      {STEPS.map((label, i) => {
        const done = i < current;
        const isCurrent = i === current;
        return (
          <React.Fragment key={label}>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "font-mono flex size-6 items-center justify-center rounded-full border text-xs font-semibold",
                  isCurrent && "bg-primary text-primary-foreground border-transparent",
                  done && "bg-primary/15 text-primary border-transparent",
                  !isCurrent && !done && "bg-muted text-muted-foreground border-border",
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-xs",
                  isCurrent && "text-foreground font-semibold",
                  done && "text-foreground/80 font-medium",
                  !isCurrent && !done && "text-muted-foreground font-medium",
                )}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && <div className={cn("mx-3 h-px w-7", i < current ? "bg-primary" : "bg-border")} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function MobileProgress({ current, className }: { current: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 border-b px-4 py-3", className)}>
      <div className="text-muted-foreground flex justify-between text-xs font-medium tracking-wide uppercase">
        <span>
          Step {current + 1} of {STEPS.length}
        </span>
        <span className="text-foreground/80">{STEPS[current]}</span>
      </div>
      <div className="flex gap-1.5">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={cn("h-1 flex-1 rounded-full transition-all", i <= current ? "bg-primary" : "bg-border")}
          />
        ))}
      </div>
    </div>
  );
}
