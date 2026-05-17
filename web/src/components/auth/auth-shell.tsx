import { SiGithub } from "@icons-pack/react-simple-icons";

import logoMark from "@/assets/pennywise.svg";
import { getConfig } from "@/lib/config";

const GITHUB_URL = "https://github.com/frysztak/pennywise";

export function AuthShell({ children }: { children: React.ReactNode }) {
  const { appVersion } = getConfig();
  return (
    <div className="relative flex min-h-svh w-full items-center justify-center px-5 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--primary) 8%, transparent) 0%, transparent 55%)",
        }}
      />
      <div className="relative z-10 flex w-full max-w-105 flex-col gap-7">
        <BrandBlock />
        {children}
        <AuthFooter version={appVersion} />
      </div>
    </div>
  );
}

function BrandBlock() {
  return (
    <div className="flex flex-col items-center gap-3.5 text-center">
      <img src={logoMark} alt="Pennywise" className="size-12 rounded-[14px]" />
      <div className="flex flex-col items-center gap-1">
        <span className="text-5xl font-bold font-serif tracking-tight">
          Pennywise
          <span className="text-money">.</span>
        </span>
      </div>
    </div>
  );
}

export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card border-border flex flex-col rounded-2xl border p-8 max-sm:rounded-xl max-sm:p-6">
      {children}
    </div>
  );
}

export function AuthHeading({ title, description }: { title: string; description: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function AuthFooter({ version }: { version: string }) {
  const hostname = typeof window === "undefined" ? "" : window.location.hostname;
  return (
    <div className="text-muted-foreground/80 flex flex-wrap items-center justify-center gap-3.5 font-mono text-xs tabular-nums">
      <span>{version.startsWith("v") ? version : `v${version}`}</span>
      <FooterDot />
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noreferrer"
        className="hover:text-foreground inline-flex items-center gap-1.5 transition-all"
      >
        <SiGithub className="size-3" />
        github
      </a>
      {hostname && (
        <>
          <FooterDot />
          <span>{hostname}</span>
        </>
      )}
    </div>
  );
}

function FooterDot() {
  return <span className="bg-input size-0.75 rounded-full" />;
}
