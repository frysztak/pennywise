import { useMutation, useSuspenseQuery } from "@connectrpc/connect-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { getReceiptPrompt, setReceiptPrompt } from "@/gen/api/v1/admin-AdminService_connectquery";
import { getConfig } from "@/lib/config";
import { handleError } from "@/lib/utils";

export function ReceiptPromptCard() {
  const { data } = useSuspenseQuery(getReceiptPrompt);
  const [prompt, setPrompt] = useState(data.prompt);

  const { mutate, isPending } = useMutation(setReceiptPrompt, {
    onSuccess: (res) => {
      toast.success("Prompt saved");
      setPrompt(res.prompt);
    },
    onError: handleError,
  });

  const scanningEnabled = getConfig().receiptScanningEnabled;
  const isDirty = prompt !== data.prompt;

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Receipt OCR prompt</CardTitle>
        <CardDescription>The instructions sent to the model when scanning a receipt.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {!scanningEnabled && (
            <p className="text-muted-foreground text-sm">
              Receipt scanning is not configured on this server, so this prompt is currently unused.
            </p>
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
              Save
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
