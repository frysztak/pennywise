import { Outlet, createFileRoute } from "@tanstack/react-router";

import { SettingsNav } from "@/features/settings/components/settings-nav";
import i18n from "@/i18n";

export const Route = createFileRoute("/_pathlessLayout/settings")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: i18n.t("meta.settings") }],
  }),
});

function RouteComponent() {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-10">
      <aside className="md:w-56 md:shrink-0">
        <SettingsNav />
      </aside>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
