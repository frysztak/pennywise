import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import { createConnectQueryKey, useMutation, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import * as React from "react";
import { toast } from "sonner";

import { ScanConfirm, ScanConfirmFooter, type ConfirmState } from "@/components/scan-receipt/scan-confirm";
import { ScanHeader, MobileProgress } from "@/components/scan-receipt/scan-header";
import { ScanProcessing, ScanProcessingFooter } from "@/components/scan-receipt/scan-processing";
import { ScanReview, ScanReviewFooter } from "@/components/scan-receipt/scan-review";
import { ScanUpload, ScanUploadFooter } from "@/components/scan-receipt/scan-upload";
import { STEP_INDEX, type ItemDraft, type ReceiptDraft, type Step } from "@/components/scan-receipt/types";
import { Card } from "@/components/ui/card";
import { bulkCreateExpenses } from "@/gen/api/v1/expense-ExpenseService_connectquery";
import { getGroupActivity, getUserGroups } from "@/gen/api/v1/group-GroupService_connectquery";
import type { ReceiptData } from "@/gen/api/v1/receipt_pb";
import { scanReceipt } from "@/gen/api/v1/receipt-ReceiptService_connectquery";
import { useAuth } from "@/auth";
import { getConfig } from "@/lib/config";
import { handleError } from "@/lib/utils";

export const Route = createFileRoute("/_pathlessLayout/scan-receipt")({
  beforeLoad: () => {
    if (!getConfig().receiptScanningEnabled) {
      toast.error("Receipt scanning is disabled");
      throw redirect({ to: "/dashboard" });
    }
  },
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Scan receipt" }],
  }),
});

const userGroupsKey = createConnectQueryKey({ schema: getUserGroups, cardinality: "finite" });

function RouteComponent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const currentUserId = auth.user?.id ?? "";

  const [step, setStep] = React.useState<Step>("upload");
  const [file, setFile] = React.useState<File | null>(null);
  const [draft, setDraft] = React.useState<ReceiptDraft | null>(null);
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [confirmState, setConfirmState] = React.useState<ConfirmState>({
    groupId: "",
    payerId: "",
    beneficiaryIds: [],
    mode: "single",
  });

  const { data: groupsData } = useQuery(getUserGroups);
  const groups = React.useMemo(() => groupsData?.groups ?? [], [groupsData]);

  const groupActivityKey = React.useMemo(
    () =>
      createConnectQueryKey({
        schema: getGroupActivity,
        cardinality: "finite",
        input: { groupId: confirmState.groupId },
      }),
    [confirmState.groupId],
  );

  // Default to the first group on Confirm if none selected yet.
  React.useEffect(() => {
    if (step !== "confirm" || confirmState.groupId || groups.length === 0) return;
    const g = groups[0];
    const memberIds = g.memberBalances.map((m) => m.userId);
    setConfirmState({
      groupId: g.groupId,
      payerId: memberIds.includes(currentUserId) ? currentUserId : (memberIds[0] ?? ""),
      beneficiaryIds: memberIds,
      mode: "single",
    });
  }, [step, confirmState.groupId, groups, currentUserId]);

  React.useEffect(() => {
    if (!file) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onClose = () => navigate({ to: "/dashboard" });

  const scanMutation = useMutation(scanReceipt, {
    onSuccess: (res) => {
      if (!res.receipt) {
        toast.error("Scan returned no data");
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
      toast.success(res.expenses.length === 1 ? "Expense created!" : `Created ${res.expenses.length} expenses!`);
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
              name: draft.merchant || "Receipt",
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
            name: item.name || "Item",
            description: draft.merchant ? `From ${draft.merchant}` : "",
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
        return "Drop a photo and we'll extract the line items";
      case "processing":
        return undefined;
      case "review":
        return draft ? `${draft.merchant || "Untitled"} · ${draft.date}` : undefined;
      case "confirm":
        return "How should this receipt land in your ledger?";
    }
  })();
  const title = (() => {
    switch (step) {
      case "upload":
        return "Scan a receipt";
      case "processing":
        return "Scanning";
      case "review":
        return "Review extracted data";
      case "confirm":
        return "Confirm & save";
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

