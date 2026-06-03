import { useSuspenseQuery } from "@connectrpc/connect-query";

import { getCurrencies } from "@/gen/api/v1/app-AppService_connectquery";

/**
 * Returns the app-wide currency list (ISO codes) served by the backend.
 * Single source of truth for the expense/transfer modals, group dialogs, and
 * the admin currency editor.
 */
export function useCurrencies(): string[] {
  const { data } = useSuspenseQuery(
    getCurrencies,
    {},
    {
      // The currency list is effectively static; avoid refetching on every mount.
      staleTime: 24 * 60 * 60 * 1000, // 24h
      gcTime: 24 * 60 * 60 * 1000,
    },
  );
  return data.currencies;
}
