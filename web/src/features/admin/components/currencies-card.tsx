import { createConnectQueryKey, useMutation, useSuspenseQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { setCurrencies } from "@/gen/api/v1/admin-AdminService_connectquery";
import { getCurrencies } from "@/gen/api/v1/app-AppService_connectquery";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/shared/components/ui/input-group";
import { Spinner } from "@/shared/components/ui/spinner";
import { handleError } from "@/shared/lib/utils";

const currenciesKey = createConnectQueryKey({ schema: getCurrencies, cardinality: "finite" });

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function CurrenciesCard() {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(getCurrencies);
  const queryClient = useQueryClient();

  const [codes, setCodes] = useState<string[]>(data.currencies);
  const [draft, setDraft] = useState("");

  const { mutate, isPending } = useMutation(setCurrencies, {
    onSuccess: (res) => {
      toast.success(t("admin.currencies.saved"));
      setCodes(res.currencies);
      queryClient.invalidateQueries({ queryKey: currenciesKey });
    },
    onError: handleError,
  });

  const addCode = () => {
    const code = draft.trim().toUpperCase();
    setDraft("");
    if (code.length < 2 || codes.includes(code)) return;
    setCodes((prev) => [...prev, code]);
  };

  const removeCode = (code: string) => setCodes((prev) => prev.filter((c) => c !== code));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addCode();
    }
  };

  const isDirty = !sameList(codes, data.currencies);

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{t("admin.currencies.title")}</CardTitle>
        <CardDescription>{t("admin.currencies.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <InputGroup>
            <InputGroupInput
              placeholder={t("admin.currencies.addPlaceholder")}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              autoCapitalize="characters"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton onClick={addCode} disabled={draft.trim().length < 2}>
                {t("admin.currencies.add")}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>

          {codes.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("admin.currencies.empty")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {codes.map((code) => (
                <Badge key={code} variant="secondary" className="gap-1 pr-1">
                  {code}
                  <button
                    type="button"
                    aria-label={t("admin.currencies.remove", { code })}
                    onClick={() => removeCode(code)}
                    className="hover:bg-foreground/10 -mr-0.5 flex size-4 items-center justify-center rounded-full transition-colors"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => mutate({ currencies: codes })}
              disabled={!isDirty || isPending || codes.length === 0}
            >
              {isPending && <Spinner />}
              {t("common.save")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
