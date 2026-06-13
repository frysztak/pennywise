import { expect, test } from "./fixtures";
import { login, makeUser, register } from "./helpers";

test("unauthenticated access to a protected route redirects to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("a user can register and then log in", async ({ page }) => {
  const user = makeUser();

  await register(page, user);
  // Registration lands on the login page.
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await login(page, user);
  await expect(page).toHaveURL(/\/dashboard/);
});

test("logging in with wrong credentials shows an error and stays on login", async ({ page }) => {
  const user = makeUser();
  await register(page, user);

  await page.goto("/auth/login");
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText(/invalid/i)).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/login/);
});
