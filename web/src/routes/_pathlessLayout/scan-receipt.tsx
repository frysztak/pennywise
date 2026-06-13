import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { createConnectQueryKey, createQueryOptions, useMutation, useSuspenseQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useAuth } from "@/features/auth/auth";
import { type ConfirmState, ScanConfirm, ScanConfirmFooter } from "@/features/scan-receipt/components/scan-confirm";
import { MobileProgress, ScanHeader } from "@/features/scan-receipt/components/scan-header";
import { ScanProcessing, ScanProcessingFooter } from "@/features/scan-receipt/components/scan-processing";
import { ScanReview, ScanReviewFooter } from "@/features/scan-receipt/components/scan-review";
import { ScanUpload, ScanUploadFooter } from "@/features/scan-receipt/components/scan-upload";
import { type ItemDraft, type ReceiptDraft, STEP_INDEX, type Step } from "@/features/scan-receipt/types";
import { bulkCreateExpenses } from "@/gen/api/v1/expense-ExpenseService_connectquery";
import { getGroupActivity, getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import { scanReceipt } from "@/gen/api/v1/receipt-ReceiptService_connectquery";
import type { ReceiptData } from "@/gen/api/v1/receipt_pb";
import i18n from "@/i18n";
import { Card } from "@/shared/components/ui/card";
import { useObjectUrl } from "@/shared/hooks/use-object-url";
import { getConfig } from "@/shared/lib/config";
import { handleError } from "@/shared/lib/utils";
import { transport } from "@/transport";

export const Route = createFileRoute("/_pathlessLayout/scan-receipt")({
  beforeLoad: async ({ context }) => {
    if (!getConfig().receiptScanningEnabled) {
      toast.error(i18n.t("scan.disabled"));
      throw redirect({ to: "/dashboard" });
    }
    await context.queryClient.ensureQueryData(createQueryOptions(getUserGroups, undefined, { transport }));
  },
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Scan receipt" }],
  }),
});

const userGroupsKey = createConnectQueryKey({ schema: getUserGroups, cardinality: "finite" });

function RouteComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const auth = useAuth();
  // guarded by router
  const currentUserId = auth.user!.id;

  const { data: groups } = useSuspenseQuery(getUserGroups, undefined, { select: (response) => response.groups });

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const imageUrl = useObjectUrl(file);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(() => {
    // Default to the first group
    const group = groups[0];
    const memberIds = group.memberBalances.map((m) => m.userId);
    return {
      groupId: group.groupId,
      payerId: memberIds.includes(currentUserId) ? currentUserId : (memberIds[0] ?? ""),
      beneficiaryIds: memberIds,
      mode: "single",
    };
  });

  const groupActivityKey = useMemo(
    () =>
      createConnectQueryKey({
        schema: getGroupActivity,
        cardinality: "finite",
        input: { groupId: confirmState.groupId },
      }),
    [confirmState.groupId],
  );

  const onClose = () => navigate({ to: "/dashboard" });

  const scanMutation = useMutation(scanReceipt, {
    onSuccess: (res) => {
      if (!res.receipt) {
        toast.error(t("scan.noData"));
        setStep("upload");
        return;
      }
      setDraft(receiptToDraft(res.receipt));
      setStep("review");
    },
    onError: (err) => {
      handleError(err);
      setStep("upload");
    },
  });

  const bulkCreateMutation = useMutation(bulkCreateExpenses, {
    onSuccess: (res) => {
      toast.success(
        res.expenses.length === 1 ? t("expense.created") : t("scan.expensesCreated", { count: res.expenses.length }),
      );
      queryClient.invalidateQueries({ queryKey: groupActivityKey });
      queryClient.invalidateQueries({ queryKey: userGroupsKey });
      navigate({ to: "/group/$groupId", params: { groupId: confirmState.groupId } });
    },
    onError: handleError,
  });

  const onContinueUpload = async () => {
    if (!file) return;
    const buf = await file.arrayBuffer();
    setStep("processing");
    scanMutation.mutate({ imageData: new Uint8Array(buf) });
  };

  const onSave = () => {
    if (!draft) return;
    const selectedItems = draft.items.filter((i) => i.selected);
    if (selectedItems.length === 0) return;

    const beneficiaries = confirmState.beneficiaryIds;
    const dateTs = timestampFromDate(parseISO(draft.date));

    const expenses =
      confirmState.mode === "single"
        ? [
            {
              groupId: confirmState.groupId,
              payerId: confirmState.payerId,
              name: draft.merchant || t("scan.defaultExpenseName"),
              description: "",
              amount: selectedItems.reduce((s, i) => s + i.price, 0),
              currency: draft.currency,
              beneficiariesIds: beneficiaries,
              date: dateTs,
            },
          ]
        : selectedItems.map((item) => ({
            groupId: confirmState.groupId,
            payerId: confirmState.payerId,
            name: item.name || t("scan.defaultItemName"),
            description: draft.merchant ? t("scan.fromMerchant", { merchant: draft.merchant }) : "",
            amount: item.price,
            currency: draft.currency,
            beneficiariesIds: beneficiaries,
            date: dateTs,
          }));

    bulkCreateMutation.mutate({ expenses });
  };

  const stepIndex = STEP_INDEX[step];
  const subtitle = (() => {
    switch (step) {
      case "upload":
        return t("scan.subtitles.upload");
      case "processing":
        return undefined;
      case "review":
        return draft
          ? t("scan.subtitles.review", { merchant: draft.merchant || t("scan.untitledShort"), date: draft.date })
          : undefined;
      case "confirm":
        return t("scan.subtitles.confirm");
    }
  })();
  const title = (() => {
    switch (step) {
      case "upload":
        return t("scan.titles.upload");
      case "processing":
        return t("scan.titles.processing");
      case "review":
        return t("scan.titles.review");
      case "confirm":
        return t("scan.titles.confirm");
    }
  })();

  const canSave =
    confirmState.groupId !== "" &&
    confirmState.payerId !== "" &&
    confirmState.beneficiaryIds.length > 0 &&
    !!draft &&
    draft.items.some((i) => i.selected);

  return (
    <Card className="overflow-hidden p-0 gap-0">
      <ScanHeader step={stepIndex} title={title} subtitle={subtitle} onClose={onClose} />
      <MobileProgress current={stepIndex} className="md:hidden" />

      {step === "upload" && <ScanUpload file={file} onFileChange={setFile} />}
      {step === "processing" && <ScanProcessing />}
      {step === "review" && draft && <ScanReview draft={draft} setDraft={setDraft} imageUrl={imageUrl} />}
      {step === "confirm" && draft && (
        <ScanConfirm
          draft={draft}
          groups={groups}
          currentUserId={currentUserId}
          state={confirmState}
          onChange={setConfirmState}
        />
      )}

      {step === "upload" && (
        <ScanUploadFooter
          onCancel={onClose}
          onContinue={onContinueUpload}
          canContinue={file !== null}
          pending={scanMutation.isPending}
        />
      )}
      {step === "processing" && <ScanProcessingFooter onCancel={() => setStep("upload")} />}
      {step === "review" && draft && (
        <ScanReviewFooter draft={draft} onBack={() => setStep("upload")} onContinue={() => setStep("confirm")} />
      )}
      {step === "confirm" && draft && (
        <ScanConfirmFooter
          draft={draft}
          state={confirmState}
          onBack={() => setStep("review")}
          onCancel={onClose}
          onSave={onSave}
          saving={bulkCreateMutation.isPending}
          canSave={canSave}
        />
      )}
    </Card>
  );
}

function receiptToDraft(receipt: ReceiptData): ReceiptDraft {
  const date = receipt.date ? timestampDate(receipt.date) : new Date();
  const dateStr = date.toISOString().split("T")[0];
  return {
    merchant: receipt.merchantName,
    date: dateStr,
    currency: receipt.currency || "EUR",
    total: receipt.total,
    items: receipt.items.map(
      (it, i): ItemDraft => ({
        id: `s-${i}`,
        name: it.name,
        qty: it.qty > 0 ? it.qty : 1,
        price: it.price,
        confidence: it.confidence,
        selected: true,
      }),
    ),
  };
}
