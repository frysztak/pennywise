import { SiGithub } from "@icons-pack/react-simple-icons";
import { useTranslation } from "react-i18next";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { getConfig } from "@/shared/lib/config";

const GITHUB_URL = "https://github.com/frysztak/pennywise";

export function AppInfoCard() {
  const { t } = useTranslation();
  const { appVersion, appCommit } = getConfig();
  const versionLabel = appVersion.startsWith("v") ? appVersion : `v${appVersion}`;
  const commit = appCommit?.replace(/-dirty$/, "");
  const commitUrl = commit ? `${GITHUB_URL}/commit/${commit}` : GITHUB_URL;
  const instanceUrl = window.location.origin;

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{t("settings.appInfo.title")}</CardTitle>
        <CardDescription>{t("settings.appInfo.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t("settings.appInfo.version")}</dt>
          <dd className="font-mono tabular-nums">{versionLabel}</dd>
          {appCommit ? (
            <>
              <dt className="text-muted-foreground">{t("settings.appInfo.commit")}</dt>
              <dd>
                <a
                  href={commitUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono tabular-nums hover:text-foreground hover:underline transition-all"
                >
                  {appCommit}
                </a>
              </dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">{t("settings.appInfo.instanceUrl")}</dt>
          <dd>
            <a
              href={instanceUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono break-all hover:text-foreground hover:underline transition-all"
            >
              {instanceUrl}
            </a>
          </dd>
        </dl>
        <Button variant="outline" render={<a href={GITHUB_URL} target="_blank" rel="noreferrer" />}>
          <SiGithub />
          {t("settings.appInfo.viewOnGithub")}
        </Button>
      </CardContent>
    </Card>
  );
}
