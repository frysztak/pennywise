import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as z from "zod";

import { AuthCard, AuthHeading, AuthShell } from "@/features/auth/components/auth-shell";
import { resolveOidcProvider } from "@/features/auth/oidc-providers";
import { Button } from "@/shared/components/ui/button";
import { Field, FieldLabel } from "@/shared/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/shared/components/ui/input-group";
import { Spinner } from "@/shared/components/ui/spinner";
import { getConfig } from "@/shared/lib/config";
import { cn } from "@/shared/lib/utils";

const formSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  isLoading?: boolean;
  onSubmit: (data: FormValues) => void;
}

export function LoginForm({ onSubmit, isLoading }: Props) {
  const config = getConfig();
  const oidcOnly = !config.passwordLoginEnabled && config.oidcEnabled;
  const provider = resolveOidcProvider(config.oidcProviderName);

  return (
    <AuthShell>
      {oidcOnly ? (
        <OidcOnlyCard provider={provider} />
      ) : (
        <CredentialsCard
          onSubmit={onSubmit}
          isLoading={isLoading}
          provider={config.oidcEnabled ? provider : null}
          showRegister={config.registrationEnabled}
        />
      )}
    </AuthShell>
  );
}

interface CredentialsCardProps {
  onSubmit: (data: FormValues) => void;
  isLoading?: boolean;
  provider: ReturnType<typeof resolveOidcProvider> | null;
  showRegister: boolean;
}

function CredentialsCard({ onSubmit, isLoading, provider, showRegister }: CredentialsCardProps) {
  const { t } = useTranslation();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });
  const [revealPassword, setRevealPassword] = useState(false);

  return (
    <AuthCard>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5.5" noValidate>
        <AuthHeading title={t("auth.login.title")} description={t("auth.login.description")} />

        <div className="flex flex-col gap-3.5">
          <Controller
            name="email"
            disabled={isLoading}
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor="email" className="text-xs font-medium">
                  {t("fields.email")}
                </FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <Mail />
                  </InputGroupAddon>
                  <InputGroupInput
                    {...field}
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                    aria-invalid={fieldState.invalid}
                  />
                </InputGroup>
              </Field>
            )}
          />

          <Controller
            name="password"
            disabled={isLoading}
            control={form.control}
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel htmlFor="password" className="text-xs font-medium">
                  {t("fields.password")}
                </FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <Lock />
                  </InputGroupAddon>
                  <InputGroupInput
                    {...field}
                    id="password"
                    type={revealPassword ? "text" : "password"}
                    placeholder="••••••••••"
                    autoComplete="current-password"
                    required
                    aria-invalid={fieldState.invalid}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      onClick={() => setRevealPassword((v) => !v)}
                      aria-label={revealPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                      aria-pressed={revealPassword}
                    >
                      {revealPassword ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            )}
          />
        </div>

        <Button type="submit" disabled={isLoading} className="h-11 w-full text-sm">
          {isLoading && <Spinner />}
          {t("auth.login.submit")}
        </Button>

        {provider && (
          <>
            <Divider>{t("auth.or")}</Divider>
            <ProviderButton provider={provider} />
          </>
        )}

        {showRegister && (
          <p className="text-muted-foreground text-center text-xs">
            {t("auth.login.noAccount")}{" "}
            <Link
              to="/auth/register"
              className="text-foreground decoration-border hover:decoration-primary underline underline-offset-[3px] transition-all"
            >
              {t("auth.login.signUp")}
            </Link>
          </p>
        )}
      </form>
    </AuthCard>
  );
}

interface OidcOnlyCardProps {
  provider: ReturnType<typeof resolveOidcProvider>;
}

function OidcOnlyCard({ provider }: OidcOnlyCardProps) {
  const { t } = useTranslation();
  return (
    <AuthCard>
      <div className="flex flex-col gap-5.5">
        <AuthHeading
          title={t("auth.oidc.title")}
          description={t("auth.oidc.description", { provider: provider.name })}
        />

        <div className="flex flex-col gap-4.5">
          <ProviderButton provider={provider} primary />

          <div className="bg-primary/15 text-secondary-foreground flex gap-2.5 rounded-md px-3.5 py-3 text-xs leading-relaxed">
            <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" />
            <p>
              <strong className="text-foreground font-medium">{t("auth.oidc.disabledTitle")}</strong>{" "}
              {t("auth.oidc.disabledBody", { provider: provider.name })}
            </p>
          </div>
        </div>
      </div>
    </AuthCard>
  );
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex items-center gap-3 text-[11px] tracking-[0.08em] uppercase">
      <span className="bg-border h-px flex-1" />
      {children}
      <span className="bg-border h-px flex-1" />
    </div>
  );
}

interface ProviderButtonProps {
  provider: ReturnType<typeof resolveOidcProvider>;
  primary?: boolean;
}

function ProviderButton({ provider, primary }: ProviderButtonProps) {
  const { t } = useTranslation();
  const Icon = provider.Icon;
  return (
    <a
      href="/auth/oidc/login"
      className={cn(
        "focus-visible:ring-ring/50 inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-md text-sm font-medium transition-all focus-visible:ring-3 focus-visible:outline-none",
        primary
          ? "bg-primary text-primary-foreground hover:bg-primary/85"
          : "bg-card hover:bg-muted dark:bg-secondary dark:hover:bg-accent text-foreground border-border hover:border-input border",
      )}
    >
      <Icon className="size-[18px]" />
      <span>{t("auth.oidc.continueWith", { provider: provider.name })}</span>
    </a>
  );
}
