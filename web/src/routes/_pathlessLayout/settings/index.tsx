import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_pathlessLayout/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/profile" });
  },
});
