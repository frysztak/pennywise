#!/usr/bin/env node
// Capture README screenshots against a running demo instance.
//
// Assumes the app is being started by the `just screenshots` recipe with
// DB_PATH=.db-demo.sqlite3. This script just waits for the app to be ready,
// logs in as a demo user, and captures the dashboard and group detail view
// at desktop and mobile viewports.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const screenshotsDir = path.join(repoRoot, "screenshots");

const BACKEND_URL = process.env.PENNYWISE_URL || "http://localhost:3333";
const LOGIN_EMAIL = "alice.chen@example.com";
const LOGIN_PASSWORD = "password123";

const targets = [
  {
    name: "desktop",
    suffix: "",
    contextOptions: {
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: "dark",
    },
  },
  {
    name: "mobile",
    suffix: "-mobile",
    contextOptions: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      colorScheme: "dark",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    },
  },
];

async function waitForServer(url, { timeoutMs = 90_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
      lastErr = new Error(`status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await sleep(500);
  }
  throw new Error(`${url} not ready within ${timeoutMs}ms: ${lastErr?.message}`);
}

async function waitForRoute(page, predicate, { timeoutMs = 15_000 } = {}) {
  // First wait for content unique to the destination route to appear. React
  // may not have rendered the new route yet right after waitForURL resolves,
  // so checking for spinners directly would pass too early (0 spinners = no
  // Suspense fallbacks mounted yet).
  await page.waitForFunction(predicate, null, { timeout: timeoutMs });
  // Then wait for every Suspense fallback to resolve.
  await page.waitForFunction(() => document.querySelectorAll('[role="status"]').length === 0, null, {
    timeout: timeoutMs,
  });
}

async function gotoUntilRendered(page, url, selector, { maxAttempts = 12, perAttemptTimeout = 1_000 } = {}) {
  for (let i = 1; i <= maxAttempts; i++) {
    if (i === 1) await page.goto(url);
    else await page.reload();
    try {
      await page.locator(selector).waitFor({ state: "visible", timeout: perAttemptTimeout });
      return;
    } catch {
      console.log(`  attempt ${i}: ${selector} not visible, reloading...`);
    }
  }
  throw new Error(`${selector} never rendered after ${maxAttempts} attempts`);
}

async function captureForTarget(browser, target) {
  console.log(`→ ${target.name}`);
  const context = await browser.newContext(target.contextOptions);
  const page = await context.newPage();

  await gotoUntilRendered(page, `${BACKEND_URL}/auth/login`, 'input[name="email"]');
  await page.locator('input[name="email"]').fill(LOGIN_EMAIL);
  await page.locator('input[name="password"]').fill(LOGIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  await waitForRoute(page, () => document.querySelector("h1")?.textContent?.trim() === "Dashboard");

  const dashboardPath = path.join(screenshotsDir, `dashboard${target.suffix}.png`);
  await page.screenshot({ path: dashboardPath });
  console.log(`  ✓ ${path.relative(repoRoot, dashboardPath)}`);

  await page.locator('a[href^="/group/"]').first().click();
  await page.waitForURL(/\/group\//, { timeout: 15_000 });
  await waitForRoute(page, () => {
    const h1 = document.querySelector("h1");
    return !!h1 && !h1.textContent?.includes("Dashboard");
  });

  const groupPath = path.join(screenshotsDir, `group-view${target.suffix}.png`);
  await page.screenshot({ path: groupPath });
  console.log(`  ✓ ${path.relative(repoRoot, groupPath)}`);

  await context.close();
}

async function main() {
  await mkdir(screenshotsDir, { recursive: true });

  console.log(`Waiting for ${BACKEND_URL}...`);
  await waitForServer(`${BACKEND_URL}/auth/login`);
  console.log("Server ready.\n");

  const browser = await chromium.launch({ headless: true });
  try {
    for (const target of targets) {
      await captureForTarget(browser, target);
    }
  } finally {
    await browser.close();
  }

  console.log("\n✓ Done.");
}

await main();
