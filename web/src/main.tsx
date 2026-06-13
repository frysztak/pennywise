import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { type Root, createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { AuthProvider, useAuth } from "@/features/auth/auth";
import "@/i18n";
import { routeTree } from "@/routeTree.gen";
import { ErrorScreen } from "@/shared/components/error-screen";
import { ThemeProvider } from "@/shared/components/theme-provider";
import { Toaster } from "@/shared/components/ui/sonner";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { transport } from "@/transport";

import "./index.css";

// Register service worker for PWA
registerSW({ immediate: true });

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultErrorComponent: ({ error }) => <ErrorScreen error={error} />,
  context: {
    auth: { isAuthenticated: false, user: null, setUserData: () => {} },
    queryClient,
  },
});

// Register things for typesafety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

declare global {
  interface Window {
    _reactRoot: Root;
  }
}

function InnerApp() {
  const auth = useAuth();
  return <RouterProvider router={router} context={{ auth, queryClient }} />;
}

const rootElement = document.getElementById("root")!;

if (!window._reactRoot) {
  window._reactRoot = createRoot(rootElement);
}

window._reactRoot.render(
  <StrictMode>
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
          <TooltipProvider delay={150}>
            <AuthProvider>
              <InnerApp />
              <Toaster closeButton richColors />
            </AuthProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </TransportProvider>
  </StrictMode>,
);
