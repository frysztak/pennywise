import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_pathlessLayout/admin/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/members" });
  },
});
