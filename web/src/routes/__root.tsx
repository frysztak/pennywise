import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";

import type { AuthState } from "@/auth";

interface MyRouterContext {
  auth: AuthState;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
  head: () => ({
    meta: [{ title: "Pennywise" }],
  }),
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <Outlet />
      {/* <TanStackRouterDevtools position="bottom-right" /> */}
      {/* <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" /> */}
    </>
  );
}
