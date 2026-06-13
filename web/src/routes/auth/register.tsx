import { useMutation } from "@connectrpc/connect-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";

import { SignupForm } from "@/features/auth/components/signup-form";
import { userRegister } from "@/gen/api/v1/user-UserService_connectquery";
import i18n from "@/i18n";
import { getConfig } from "@/shared/lib/config";
import { handleError } from "@/shared/lib/utils";

export const Route = createFileRoute("/auth/register")({
  beforeLoad: () => {
    if (!getConfig().registrationEnabled) {
      throw redirect({ to: "/auth/login" });
    }
  },
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Register" }],
  }),
});

function RouteComponent() {
  const navigate = Route.useNavigate();

  const { mutate, isPending } = useMutation(userRegister, {
    onSuccess: () => {
      toast.success(i18n.t("auth.register.success"));
      navigate({ to: "/auth/login" });
    },
    onError: handleError,
  });

  const handleSubmit = (data: { username: string; email: string; password: string; confirmPassword: string }) => {
    mutate({
      username: data.username,
      email: data.email,
      password: data.password,
    });
  };

  return <SignupForm onSubmit={handleSubmit} isLoading={isPending} />;
}
