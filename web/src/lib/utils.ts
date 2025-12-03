import { clsx, type ClassValue } from "clsx";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";
import type { ConnectError } from "@connectrpc/connect";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function handleError(err: ConnectError) {
  toast.error(err.message);
}
