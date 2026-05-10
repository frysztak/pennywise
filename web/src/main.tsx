import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { Toaster } from "sonner";

import { AuthProvider, useAuth } from "./auth";
import { ErrorScreen } from "./components/error-screen";
import { ThemeProvider } from "./components/theme-provider";
import "./index.css";
import { routeTree } from "./routeTree.gen";
import { transport } from "./transport";

// Register service worker for PWA
registerSW({ immediate: true });

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultErrorComponent: ({ error }) => <ErrorScreen error={error} />,
  context: {
    // auth will be passed down from App component
    auth: undefined!,
    queryClient: undefined!,
  },
});

const queryClient = new QueryClient();

// Register things for typesafety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function InnerApp() {
  const auth = useAuth();
  return <RouterProvider router={router} context={{ auth, queryClient }} />;
}

const rootElement = document.getElementById("root")!;

if (!rootElement.innerHTML) {
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <TransportProvider transport={transport}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
            <AuthProvider>
              <InnerApp />
              <Toaster closeButton />
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </TransportProvider>
    </StrictMode>,
  );
}
