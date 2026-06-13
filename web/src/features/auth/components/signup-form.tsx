import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as z from "zod";

import { AuthCard, AuthHeading, AuthShell } from "@/features/auth/components/auth-shell";
import { Button } from "@/shared/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/shared/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/shared/components/ui/input-group";
import { Spinner } from "@/shared/components/ui/spinner";

const makeFormSchema = (t: TFunction) =>
  z
    .object({
      username: z.string().min(3, t("auth.register.usernameMin")),
      email: z.email(t("auth.register.emailInvalid")),
      password: z.string().min(6, t("auth.register.passwordMin")),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("validation.passwordMatch"),
      path: ["confirmPassword"],
    });

type FormValues = z.infer<ReturnType<typeof makeFormSchema>>;

interface Props {
  isLoading?: boolean;
  onSubmit: (data: FormValues) => void;
}

export function SignupForm({ onSubmit, isLoading }: Props) {
  const { t } = useTranslation();
  const formSchema = useMemo(() => makeFormSchema(t), [t]);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: "", email: "", password: "", confirmPassword: "" },
  });
  const [revealPassword, setRevealPassword] = useState(false);
  const [revealConfirm, setRevealConfirm] = useState(false);

  return (
    <AuthShell>
      <AuthCard>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5.5" noValidate>
          <AuthHeading title={t("auth.register.title")} description={t("auth.register.description")} />

          <div className="flex flex-col gap-3.5">
            <Controller
              name="username"
              disabled={isLoading}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="username" className="text-xs font-medium">
                    {t("fields.username")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <User />
                    </InputGroupAddon>
                    <InputGroupInput
                      {...field}
                      id="username"
                      type="text"
                      placeholder="johndoe"
                      autoComplete="username"
                      required
                      aria-invalid={fieldState.invalid}
                    />
                  </InputGroup>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

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
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
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
                      placeholder={t("auth.register.passwordHint")}
                      autoComplete="new-password"
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
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            <Controller
              name="confirmPassword"
              disabled={isLoading}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="confirm-password" className="text-xs font-medium">
                    {t("auth.register.confirmPassword")}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <Lock />
                    </InputGroupAddon>
                    <InputGroupInput
                      {...field}
                      id="confirm-password"
                      type={revealConfirm ? "text" : "password"}
                      placeholder="••••••••••"
                      autoComplete="new-password"
                      required
                      aria-invalid={fieldState.invalid}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-xs"
                        onClick={() => setRevealConfirm((v) => !v)}
                        aria-label={revealConfirm ? t("auth.hidePassword") : t("auth.showPassword")}
                        aria-pressed={revealConfirm}
                      >
                        {revealConfirm ? <EyeOff /> : <Eye />}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </div>

          <Button type="submit" disabled={isLoading} className="h-11 w-full text-sm">
            {isLoading && <Spinner />}
            {t("auth.register.submit")}
          </Button>

          <p className="text-muted-foreground text-center text-xs">
            {t("auth.register.hasAccount")}{" "}
            <Link
              to="/auth/login"
              className="text-foreground decoration-border hover:decoration-primary underline underline-offset-[3px] transition-all"
            >
              {t("auth.register.signIn")}
            </Link>
          </p>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
