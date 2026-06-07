import { type Transport, createRouterTransport } from "@connectrpc/connect";
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";

// Disable retries so error paths resolve on the first attempt instead of
// hanging the test while TanStack Query backs off.
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

// For components that render without hitting the network.
const emptyTransport = createRouterTransport(() => {});

interface Options {
  transport?: Transport;
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactNode,
  { transport = emptyTransport, queryClient = createTestQueryClient() }: Options = {},
) {
  const result = render(
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </TransportProvider>,
  );
  return { queryClient, transport, ...result };
}
