import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const PORT = process.env.E2E_PORT ?? "3334";
const APP_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
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
    // Production mode: a single Go server serves the embedded web/dist build on
    // its own port, so it runs alongside `just dev` without a Vite dependency.
    // web/dist must be built first (`just e2e` does this).
    command: "go run main.go",
    url: APP_URL,
    cwd: repoRoot,
    reuseExistingServer: false,
    timeout: 120_000,
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
