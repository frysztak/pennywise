import { Sparkles } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";

export function ScanProcessing() {
  // Indeterminate animated bar — capped at ~95% so the final jump happens when the RPC resolves.
  const [progress, setProgress] = React.useState(0);
  React.useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const next = Math.min(95, Math.round(100 * (1 - Math.exp(-elapsed / 4))));
      setProgress(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex min-h-120 flex-col items-center justify-center gap-8 p-10">
      <style>{`
        @keyframes pw-pulse {
          0%   { transform: scale(1);    opacity: 0.18; }
          60%  { transform: scale(1.65); opacity: 0;    }
          100% { transform: scale(1.65); opacity: 0;    }
        }
      `}</style>
      <div className="relative size-18">
        <div
          className="bg-primary absolute inset-0 rounded-full"
          style={{ animation: "pw-pulse 2s ease-out infinite" }}
        />
        <div className="border-primary/25 bg-primary/10 relative flex size-18 items-center justify-center rounded-full border">
          <Sparkles className="text-primary size-7" strokeWidth={1.5} />
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="text-base font-semibold tracking-tight md:text-lg">Reading your receipt…</div>
        <div className="text-muted-foreground text-sm">This usually takes a few seconds</div>
      </div>

      <div className="bg-border h-0.75 w-80 max-w-full overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function ScanProcessingFooter({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="bg-card flex items-center justify-between gap-3 border-t px-4 py-3 md:px-6 md:py-3.5">
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
