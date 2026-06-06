import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const PORT = process.env.E2E_PORT ?? "3334";
const APP_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: APP_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Runs the prebuilt production binary (embeds web/dist); `just e2e` builds
    // it with `go build -cover` so the run also yields backend coverage.
    command: "./pennywise-e2e",
    url: APP_URL,
    cwd: repoRoot,
    reuseExistingServer: false,
    timeout: 120_000,
    // SIGTERM lets main() shut down gracefully so the -cover runtime flushes
    // coverage (to GOCOVERDIR, set by the justfile) before exit.
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    env: {
      PORT,
      DB_PATH: ":memory:",
      AUTH_SECRET: "e2e-test-secret",
      STORAGE_PATH: path.join(repoRoot, ".e2e-data"),
      LOG_LEVEL: "warn",
      REGISTRATION_ENABLED: "true",
      PASSWORD_LOGIN_ENABLED: "true",
      OIDC_ISSUER: "",
      OIDC_CLIENT_ID: "",
      OIDC_CLIENT_SECRET: "",
      OIDC_REDIRECT_URL: "",
      OPENAI_API_KEY: "",
      OPENAI_OCR_MODEL: "",
    },
  },
});
