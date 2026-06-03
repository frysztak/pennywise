import { useMutation } from "@connectrpc/connect-query";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { useAuth } from "@/features/auth/auth";
import { LoginForm } from "@/features/auth/components/login-form";
import { loginWithPassword } from "@/gen/api/v1/auth-AuthService_connectquery";

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
    onError: (error) => {
      toast.error(error.rawMessage);
    },
  });

  if (isAuthenticated) {
    return <Navigate to="/dashboard" />;
  }

  return <LoginForm onSubmit={mutate} isLoading={isPending} />;
}
