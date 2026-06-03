import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AdminNav } from "@/features/admin/components/admin-nav";
import { UserRole } from "@/gen/api/v1/user_pb";

export const Route = createFileRoute("/_pathlessLayout/admin")({
  beforeLoad: ({ context }) => {
    if (context.auth.user?.role !== UserRole.ADMIN) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Admin" }],
  }),
});

function RouteComponent() {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-10">
      <aside className="md:w-56 md:shrink-0">
        <AdminNav />
      </aside>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
