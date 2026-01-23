import { useMutation } from "@connectrpc/connect-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";

import { SignupForm } from "@/components/signup-form";
import { getConfig } from "@/lib/config";
import { userRegister } from "@/gen/api/v1/user-UserService_connectquery";
import { handleError } from "@/lib/utils";

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
      toast.success("Account created successfully! Please log in.");
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

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <SignupForm onSubmit={handleSubmit} isLoading={isPending} />
      </div>
    </div>
  );
}
