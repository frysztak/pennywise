import { SiGithub } from "@icons-pack/react-simple-icons";
import { Link } from "@tanstack/react-router";
import { AlertCircle, Check, ChevronDown, Copy, Home, RefreshCw, Terminal } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getConfig } from "@/lib/config";
import { cn } from "@/lib/utils";

const GITHUB_URL = "https://github.com/frysztak/pennywise";

interface ErrorScreenProps {
  error: Error;
  reset?: () => void;
}

interface StackFrame {
  fn: string;
  location: string;
  app: boolean;
}

function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return [];
  const lines = stack.split("\n");
  const frames: StackFrame[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("at ")) continue;
    const body = line.slice(3);
    let fn = "<anonymous>";
    let location = "";
    const parenMatch = body.match(/^(.+?)\s+\((.+)\)$/);
    if (parenMatch) {
      fn = parenMatch[1];
      location = parenMatch[2];
    } else {
      location = body;
    }
    const app =
      !!location &&
      !location.includes("node_modules") &&
      !location.includes("react-dom") &&
      !location.includes("react-stack-bottom-frame") &&
      !location.startsWith("native");
    frames.push({ fn, location, app });
  }
  return frames;
}

function makeDigest(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(h, 31) + input.charCodeAt(i)) | 0;
  }
  return "PW-" + (h >>> 0).toString(16).padStart(8, "0");
}

function buildReport(error: Error, version: string, timestamp: string, digest: string) {
  return [
    "Pennywise error report",
    `ref:     ${digest}`,
    `version: ${version}`,
    `time:    ${timestamp}`,
    `url:     ${typeof window !== "undefined" ? window.location.href : ""}`,
    `name:    ${error.name}`,
    `message: ${error.message}`,
    "",
    error.stack ?? "(no stack)",
  ].join("\n");
}

export function ErrorScreen({ error }: ErrorScreenProps) {
  const [copied, setCopied] = useState(false);
  const { appVersion } = getConfig();
  const frames = parseStack(error.stack);
  const digest = makeDigest((error.stack ?? "") + (error.message ?? "") + (error.name ?? ""));
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const versionLabel = appVersion.startsWith("v") ? appVersion : `v${appVersion}`;

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(buildReport(error, appVersion, timestamp, digest));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard may be unavailable; ignore
    }
  };

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col">
      <main className="flex flex-1 items-center justify-center overflow-auto p-10 max-sm:px-5 max-sm:py-6">
        <div className="flex w-full max-w-[520px] flex-col gap-6 max-sm:max-w-[360px] max-sm:gap-5">
          <BrokenReceipt className="size-[72px] max-sm:size-14" />

          <div className="flex flex-col gap-2.5">
            <h1 className="font-serif text-[52px] leading-[1.04] font-normal tracking-[-0.015em] max-sm:text-[40px]">
              Something broke<span className="text-destructive">.</span>
            </h1>
            <p className="text-foreground/80 max-w-[460px] text-base leading-relaxed max-sm:text-[15px]">
              Pennywise hit an unexpected error and couldn&apos;t render this view. Your expenses are safe — nothing was
              lost or changed.
            </p>
          </div>

          <div className="bg-destructive/10 border-destructive/20 flex items-start gap-3 rounded-lg border p-3.5">
            <AlertCircle className="text-destructive mt-0.5 size-[18px] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-foreground font-mono text-[13px] leading-relaxed font-medium break-words">
                <span className="text-destructive">{error.name || "Error"}</span>
                <span className="text-muted-foreground">{": "}</span>
                {error.message || "Unknown error"}
              </div>
              <div className="text-muted-foreground mt-1 font-mono text-[11px]">ref {digest}</div>
            </div>
          </div>

          <div className="flex gap-2.5 max-sm:flex-col">
            <Button
              size="lg"
              className="h-11 flex-1 px-4 text-sm max-sm:flex-none"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="size-[18px]" />
              Reload Pennywise
            </Button>
            <Button
              variant="outline"
              size="lg"
              nativeButton={false}
              className="h-11 flex-none px-4 text-sm"
              render={
                <Link to="/">
                  <Home className="size-[18px]" />
                  Go home
                </Link>
              }
            />
          </div>

          <Collapsible className="border-border bg-card overflow-hidden rounded-lg border">
            <CollapsibleTrigger className="text-foreground/85 group flex w-full items-center justify-between px-3.5 py-3 text-[13px] font-medium transition-all">
              <span className="flex items-center gap-2.5">
                <Terminal className="size-[15px]" />
                Technical details
              </span>
              <ChevronDown className="text-muted-foreground size-[15px] transition-all group-data-[panel-open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="border-border/50 border-t">
              <div className="text-muted-foreground max-h-[220px] overflow-auto px-3.5 py-3 font-mono text-xs leading-[1.6] max-sm:max-h-[180px]">
                {frames.length > 0 ? (
                  frames.map((frame, i) => (
                    <div
                      key={i}
                      className={cn("flex gap-2 py-0.5", frame.app ? "text-foreground" : "text-muted-foreground/60")}
                    >
                      <span className="text-muted-foreground/60 min-w-[18px] tabular-nums">{i}</span>
                      <span className={cn("shrink-0", frame.app ? "text-primary" : "text-muted-foreground")}>
                        at {frame.fn}
                      </span>
                      <span className="text-muted-foreground/60 flex-1 truncate text-right">{frame.location}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground/70 italic">No stack trace available.</div>
                )}
                <div className="border-border/50 mt-2.5 flex gap-2 border-t border-dashed pt-2.5">
                  <button
                    type="button"
                    onClick={copyReport}
                    className={cn(
                      "border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-all",
                      copied ? "text-money" : "text-foreground/85",
                    )}
                  >
                    {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                    {copied ? "Copied" : "Copy report"}
                  </button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="text-muted-foreground/80 flex flex-wrap items-center justify-center gap-3.5 font-mono text-xs tabular-nums">
            <span>{versionLabel}</span>
            <FooterDot />
            <a
              href={`${GITHUB_URL}/issues/new`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground inline-flex items-center gap-1.5 transition-all"
            >
              <SiGithub className="size-3" />
              report
            </a>
            <FooterDot />
            <span>{timestamp}</span>
          </div>
        </div>
      </main>
    </div>
  );
}

function FooterDot() {
  return <span className="bg-input size-[3px] rounded-full" />;
}

function BrokenReceipt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 76" fill="none" className={className}>
      <path
        d="M14 6 L58 6 L58 38 L52 36 L46 39 L40 36 L34 39 L28 36 L22 39 L18 37 Z"
        className="fill-card stroke-border"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M16 44 L60 41 L60 70 L54 68 L48 71 L42 68 L36 71 L30 68 L24 71 L20 69 Z"
        className="fill-card stroke-border"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <rect x="20" y="14" width="28" height="3" rx="1.5" className="fill-muted-foreground" opacity="0.55" />
      <rect x="20" y="21" width="20" height="3" rx="1.5" className="fill-muted-foreground" opacity="0.35" />
      <rect x="20" y="28" width="14" height="3" rx="1.5" className="fill-muted-foreground" opacity="0.22" />
      <rect x="22" y="50" width="22" height="3" rx="1.5" className="fill-muted-foreground" opacity="0.35" />
      <rect x="22" y="58" width="16" height="3" rx="1.5" className="fill-muted-foreground" opacity="0.22" />
      <rect x="42" y="49" width="14" height="4" rx="2" className="fill-primary" opacity="0.85" />
    </svg>
  );
}
