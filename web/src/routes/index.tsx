import { createFileRoute, redirect } from "@tanstack/react-router";

// Entry route: always redirects based on auth state, so it renders no component.
export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: "/auth/login",
      });
    } else {
      throw redirect({
        to: "/dashboard",
      });
    }
  },
});
