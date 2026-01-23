import { useMutation } from "@connectrpc/connect-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

import { useAuth } from "@/auth";
import { LoginForm } from "@/components/login-form";
import { loginWithPassword } from "@/gen/api/v1/auth-AuthService_connectquery";

export const Route = createFileRoute("/auth/login")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Login" }],
  }),
});

function RouteComponent() {
  const navigate = Route.useNavigate();
  const router = useRouter();

  const { setUserData } = useAuth();

  const { mutate, isPending } = useMutation(loginWithPassword, {
    onSuccess: (data) => {
      setUserData({ ...data, $typeName: "api.v1.UserInfoResponse" });
      router.invalidate().then(() => {
        navigate({ to: "/dashboard" });
      });
    },
    onError: (error) => {
      toast.error(error.rawMessage);
    },
  });

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md">
        <LoginForm onSubmit={mutate} isLoading={isPending} />
      </div>
    </div>
  );
}
