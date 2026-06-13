import { useMutation } from "@connectrpc/connect-query";
import { Navigate, createFileRoute } from "@tanstack/react-router";

import { useAuth } from "@/features/auth/auth";
import { LoginForm } from "@/features/auth/components/login-form";
import { loginWithPassword } from "@/gen/api/v1/auth-AuthService_connectquery";
import { handleError } from "@/shared/lib/utils";

export const Route = createFileRoute("/auth/login")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Login" }],
  }),
});

function RouteComponent() {
  const { setUserData, isAuthenticated } = useAuth();

  const { mutate, isPending } = useMutation(loginWithPassword, {
    onSuccess: (data) => {
      setUserData({ ...data, $typeName: "api.v1.UserInfoResponse" });
    },
    onError: handleError,
  });

  if (isAuthenticated) {
    return <Navigate to="/dashboard" />;
  }

  return <LoginForm onSubmit={mutate} isLoading={isPending} />;
}
