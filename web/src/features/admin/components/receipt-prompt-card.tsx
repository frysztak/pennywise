import { useMutation, useSuspenseQuery } from "@connectrpc/connect-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { getReceiptPrompt, setReceiptPrompt } from "@/gen/api/v1/admin-AdminService_connectquery";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Spinner } from "@/shared/components/ui/spinner";
import { Textarea } from "@/shared/components/ui/textarea";
import { getConfig } from "@/shared/lib/config";
import { handleError } from "@/shared/lib/utils";

export function ReceiptPromptCard() {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(getReceiptPrompt);
  const [prompt, setPrompt] = useState(data.prompt);

  const { mutate, isPending } = useMutation(setReceiptPrompt, {
    onSuccess: (res) => {
      toast.success(t("admin.receiptPrompt.saved"));
      setPrompt(res.prompt);
    },
    onError: handleError,
  });

  const scanningEnabled = getConfig().receiptScanningEnabled;
  const isDirty = prompt !== data.prompt;

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{t("admin.receiptPrompt.title")}</CardTitle>
        <CardDescription>{t("admin.receiptPrompt.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {!scanningEnabled && (
            <p className="text-muted-foreground text-sm">{t("admin.receiptPrompt.notConfigured")}</p>
          )}
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={16}
            className="font-mono text-xs"
          />
          <div className="flex justify-end">
            <Button onClick={() => mutate({ prompt })} disabled={!isDirty || isPending || prompt.trim().length === 0}>
              {isPending && <Spinner />}
              {t("common.save")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
