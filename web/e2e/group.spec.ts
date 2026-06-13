import { expect, test } from "./fixtures";
import { createGroup, login, makeUser, register } from "./helpers";

test("a freshly created group can be opened after visiting another one", async ({ page }) => {
  const user = makeUser();
  await register(page, user);
  await login(page, user);

  // Visit group A first. This primes the {filter: ALL} getUserGroups cache that
  // the group route reads in beforeLoad, so it can go stale on the next create.
  const groupA = `Trip A ${Date.now()}`;
  await createGroup(page, groupA);
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(groupA) })
    .click();
  await page.waitForURL(/\/group\//);
  await expect(page.getByRole("heading", { name: groupA })).toBeVisible();

  // Navigate back within the SPA (not a full reload) to keep the query cache
  // alive, then create group B and open it immediately.
  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.waitForURL(/\/dashboard$/);

  const groupB = `Trip B ${Date.now()}`;
  await createGroup(page, groupB);
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(groupB) })
    .click();

  // The group must open without bouncing back to the dashboard with a
  // "Group not found" toast caused by reading a stale cache.
  await page.waitForURL(/\/group\//);
  await expect(page.getByRole("heading", { name: groupB })).toBeVisible();
  await expect(page.getByText("Group not found")).toHaveCount(0);
});
