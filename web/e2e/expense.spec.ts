import { expect, test } from "./fixtures";
import { createGroup, login, makeUser, register } from "./helpers";

test("a user can create a group and add an expense to it", async ({ page }) => {
  const user = makeUser();
  await register(page, user);
  await login(page, user);

  const groupName = `Trip ${Date.now()}`;
  await createGroup(page, groupName);

  // Open the newly created group from the dashboard.
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(groupName) })
    .click();
  await page.waitForURL(/\/group\//);

  await page.getByRole("button", { name: "Add Expense" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Add new expense")).toBeVisible();

  const expenseName = "Dinner";
  await dialog.locator("#expenseName").fill(expenseName);
  await dialog.locator("#amountWithCurrency").fill("30");
  await dialog.getByRole("button", { name: "Create Expense" }).click();
  await expect(dialog).toBeHidden();

  // The new expense shows up in the activity feed.
  await expect(page.getByText(expenseName).first()).toBeVisible();
});
