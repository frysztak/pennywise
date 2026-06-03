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

export const STEPS = ["Upload", "Scan", "Review", "Save"] as const;
export const STEP_INDEX: Record<Step, number> = {
  upload: 0,
  processing: 1,
  review: 2,
  confirm: 3,
};
