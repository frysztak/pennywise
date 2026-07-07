import { type Page, expect } from "@playwright/test";

export interface TestUser {
  username: string;
  email: string;
  password: string;
}

let counter = 0;

export function makeUser(): TestUser {
  counter += 1;
  const id = `${Date.now()}-${counter}`;
  return {
    username: `e2e-${id}`,
    email: `e2e-${id}@example.com`,
    password: "password123",
  };
}

export async function register(page: Page, user: TestUser) {
  await page.goto("/auth/register");
  await page.locator("#username").fill(user.username);
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.locator("#confirm-password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/auth\/login/);
}

export async function login(page: Page, user: Pick<TestUser, "email" | "password">) {
  await page.goto("/auth/login");
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

export async function createGroup(page: Page, name: string) {
  await page.getByRole("main").getByRole("button", { name: "New Group" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#groupName").fill(name);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
}
