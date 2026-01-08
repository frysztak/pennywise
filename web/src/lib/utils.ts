import type { ConnectError } from "@connectrpc/connect";
import { type ClassValue, clsx } from "clsx";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function handleError(err: ConnectError) {
  toast.error(err.message);
}

export function formatCurrency(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}
