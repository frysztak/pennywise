import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { createConnectTransport } from "@connectrpc/connect-web";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TransportProvider } from "@connectrpc/connect-query";
import { routeTree } from "./routeTree.gen";
import "./index.css";
import { ThemeProvider } from "./components/theme-provider";
import { AuthProvider, useAuth } from "./auth";
import { Toaster } from "sonner";
import { transport } from "./transport";

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  context: {
    // auth will be passed down from App component
    auth: undefined!,
    queryClient: undefined!
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
    </StrictMode>
  );
}
