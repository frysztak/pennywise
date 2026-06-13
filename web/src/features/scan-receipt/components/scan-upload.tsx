import { Check, ChevronRight, Receipt, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/shared/components/ui/button";
import { Separator } from "@/shared/components/ui/separator";
import { Spinner } from "@/shared/components/ui/spinner";
import { useObjectUrl } from "@/shared/hooks/use-object-url";
import { cn } from "@/shared/lib/utils";

export function ScanUpload({ file, onFileChange }: { file: File | null; onFileChange: (file: File | null) => void }) {
  const { t } = useTranslation();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useObjectUrl(file);

  const handleFiles = (files: FileList | null | File[]) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!f.type.startsWith("image/")) return;
    onFileChange(f);
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) {
            e.preventDefault();
            onFileChange(f);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFileChange]);

  return (
    <div className="grid md:min-h-120 md:grid-cols-[1.6fr_1fr]">
      <div className="flex flex-col gap-4 border-b p-4 md:border-r md:border-b-0 md:p-6">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {file && previewUrl ? (
          <div className="relative flex flex-1 flex-col gap-3 overflow-hidden rounded-xl border bg-muted/40 p-3 md:min-h-72">
            <div className="bg-background relative flex flex-1 items-center justify-center overflow-hidden rounded-lg">
              <img src={previewUrl} alt={file.name} className="max-h-105 w-auto object-contain" />
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{file.name}</div>
                <div className="text-muted-foreground text-xs">
                  {t("scan.upload.fileSize", { size: (file.size / 1024 / 1024).toFixed(2) })} ·{" "}
                  {file.type || t("scan.upload.imageFallback")}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                  {t("scan.upload.replace")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onFileChange(null)}>
                  <X /> {t("scan.upload.remove")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "group/dropzone relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-dashed p-6 text-center transition-all md:min-h-72 md:gap-4 md:p-8",
              dragOver
                ? "border-primary bg-primary/10"
                : "border-input bg-muted/40 hover:border-primary/50 hover:bg-muted/60",
            )}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                backgroundImage: "repeating-linear-gradient(0deg, transparent 0 23px, var(--border) 23px 24px)",
              }}
            />

            <div className="border-primary/20 bg-primary/10 text-primary relative flex size-16 items-center justify-center rounded-2xl border md:size-20">
              <Receipt className="size-7 md:size-9" strokeWidth={1.4} />
            </div>

            <div className="relative">
              <div className="text-base font-semibold md:text-lg">{t("scan.upload.drop")}</div>
              <div className="text-muted-foreground mt-1 text-xs md:mt-1.5 md:text-sm">
                {t("scan.upload.or")}{" "}
                <span className="text-primary underline underline-offset-4">{t("scan.upload.browse")}</span>
                <span className="mx-1.5">·</span>
                {t("scan.upload.formats")}
              </div>
            </div>
          </div>
        )}

        <div className="text-muted-foreground hidden items-center gap-2.5 text-xs md:flex">
          {t("scan.upload.pasteHint")}
        </div>
      </div>

      <div className="flex flex-col gap-5 overflow-y-auto p-4 md:p-6">
        <div>
          <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            {t("scan.upload.whatWeDo")}
          </div>
          <div className="mt-3 flex flex-col gap-3">
            <ExplainerStep n={1} label={t("scan.upload.step1Label")} body={t("scan.upload.step1Body")} />
            <ExplainerStep n={2} label={t("scan.upload.step2Label")} body={t("scan.upload.step2Body")} />
            <ExplainerStep n={3} label={t("scan.upload.step3Label")} body={t("scan.upload.step3Body")} />
          </div>
        </div>

        <Separator />

        <div>
          <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            {t("scan.upload.tipsTitle")}
          </div>
          <div className="mt-3 flex flex-col gap-2.5">
            <Tip text={t("scan.upload.tip1")} />
            <Tip text={t("scan.upload.tip2")} />
            <Tip text={t("scan.upload.tip3")} />
          </div>
        </div>

        <div className="hidden flex-1 md:block" />
      </div>
    </div>
  );
}

function ExplainerStep({ n, label, body }: { n: number; label: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="bg-muted text-foreground/80 font-mono mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
        {n}
      </div>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-muted-foreground mt-0.5 text-xs leading-snug">{body}</div>
      </div>
    </div>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="bg-primary/15 text-primary mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full">
        <Check className="size-2.5" strokeWidth={3} />
      </div>
      <div className="text-foreground/90 text-sm leading-snug">{text}</div>
    </div>
  );
}

export function ScanUploadFooter({
  onCancel,
  onContinue,
  canContinue,
  pending,
}: {
  onCancel: () => void;
  onContinue: () => void;
  canContinue: boolean;
  pending: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="bg-card flex flex-col-reverse gap-3 border-t px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6 md:py-3.5">
      <div className="text-muted-foreground hidden text-xs md:block">{t("scan.upload.privacy")}</div>
      <div className="flex gap-2.5 md:gap-2.5">
        <Button variant="ghost" onClick={onCancel} className="flex-1 md:flex-initial">
          {t("common.cancel")}
        </Button>
        <Button disabled={!canContinue || pending} onClick={onContinue} className="flex-1 md:flex-initial">
          {pending ? <Spinner /> : null}
          {t("scan.continue")} {!pending && <ChevronRight />}
        </Button>
      </div>
    </div>
  );
}
