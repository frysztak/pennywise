export type Step = "upload" | "processing" | "review" | "confirm";

export interface ItemDraft {
  id: string;
  name: string;
  qty: number;
  price: number;
  confidence: number;
  selected: boolean;
}

export interface ReceiptDraft {
  merchant: string;
  date: string; // YYYY-MM-DD
  currency: string;
  total: number;
  items: ItemDraft[];
}

// Translation keys for the wizard steps; callers render them through t().
export const STEPS = ["scan.steps.upload", "scan.steps.scan", "scan.steps.review", "scan.steps.save"] as const;
export const STEP_INDEX: Record<Step, number> = {
  upload: 0,
  processing: 1,
  review: 2,
  confirm: 3,
};
