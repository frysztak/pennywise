import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";

import { AuthCard, AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";

const formSchema = z
  .object({
    username: z.string().min(3, "Username must be at least 3 characters long"),
    email: z.email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters long"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof formSchema>;

interface Props {
  isLoading?: boolean;
  onSubmit: (data: FormValues) => void;
}

export function SignupForm({ onSubmit, isLoading }: Props) {
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
          <AuthHeading
            title="Create your account"
            description="Set up Pennywise to start tracking shared expenses with friends and family."
          />

          <div className="flex flex-col gap-3.5">
            <Controller
              name="username"
              disabled={isLoading}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="username" className="text-xs font-medium">
                    Username
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
                    Email
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
                    Password
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <Lock />
                    </InputGroupAddon>
                    <InputGroupInput
                      {...field}
                      id="password"
                      type={revealPassword ? "text" : "password"}
                      placeholder="At least 6 characters"
                      autoComplete="new-password"
                      required
                      aria-invalid={fieldState.invalid}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        size="icon-xs"
                        onClick={() => setRevealPassword((v) => !v)}
                        aria-label={revealPassword ? "Hide password" : "Show password"}
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
                    Confirm password
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
                        aria-label={revealConfirm ? "Hide password" : "Show password"}
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
            Create account
          </Button>

          <p className="text-muted-foreground text-center text-xs">
            Already have an account?{" "}
            <Link
              to="/auth/login"
              className="text-foreground decoration-border hover:decoration-primary underline underline-offset-[3px] transition-all"
            >
              Sign in
            </Link>
          </p>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
