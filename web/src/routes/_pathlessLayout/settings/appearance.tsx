import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AppearanceCard } from "@/features/settings/components/appearance-card";
import i18n from "@/i18n";

export const Route = createFileRoute("/_pathlessLayout/settings/appearance")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: i18n.t("meta.settingsAppearance") }],
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold font-serif tracking-tight">{t("settings.nav.appearance")}</h1>
      <AppearanceCard />
    </div>
  );
}
