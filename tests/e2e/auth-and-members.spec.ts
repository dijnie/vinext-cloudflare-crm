import { expect, request as createRequest, test } from "@playwright/test";
import type { Browser } from "@playwright/test";

function requiredEnvironment(name: string): string {
  const value = process["env"][name];
  if (!value) throw new Error(`${name} is required for preview E2E`);
  return value;
}

test("localized auth routes preserve locale state", async ({ page }) => {
  await page.goto("/vi/sign-in?source=e2e");
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  await page.getByRole("button", { name: "Ngôn ngữ: EN" }).click();
  await expect(page).toHaveURL(/\/en\/sign-in\?source=e2e$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/en\/sign-in$/);
});

async function signedInContext(browser: Browser, baseURL: string, emailName: string, passwordName: string) {
  const api = await createRequest.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { origin: baseURL } });
  const signIn = await api.post("/api/auth/sign-in/email", { data: { email: requiredEnvironment(emailName), password: requiredEnvironment(passwordName) } });
  expect(signIn.ok()).toBe(true);
  const context = await browser.newContext({ ignoreHTTPSErrors: true, storageState: await api.storageState() });
  return { api, context };
}

test("owner sees localized members and canonical stale slugs", async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("E2E_BASE_URL is required for preview E2E");
  const { api, context } = await signedInContext(browser, baseURL, "E2E_OWNER_EMAIL", "E2E_OWNER_PASSWORD");
  const members = await api.get("/api/crm/members");
  expect(members.status()).toBe(200);
  const page = await context.newPage();
  await page.goto("/vi/stale-workspace/settings/members?status=active");
  await expect(page).toHaveURL(/\/vi\/crm\/settings\/members\?status=active$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page.getByRole("heading", { name: "Thành viên" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Thành viên" })).toBeVisible();
  await page.getByRole("button", { name: "Ngôn ngữ: EN" }).click();
  await expect(page).toHaveURL(/\/en\/crm\/settings\/members\?status=active$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await context.close();
  await api.dispose();
});

test("member cannot see or call owner-only member management", async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("E2E_BASE_URL is required for preview E2E");
  const { api, context } = await signedInContext(browser, baseURL, "E2E_MEMBER_EMAIL", "E2E_MEMBER_PASSWORD");
  const members = await api.get("/api/crm/members");
  expect(members.status()).toBe(403);
  expect(await members.json()).toMatchObject({ error: { code: "owner_required" } });
  const page = await context.newPage();
  await page.goto("/vi/crm/companies");
  await expect(page.getByRole("link", { name: "Thành viên" })).toHaveCount(0);
  await page.goto("/en/crm/settings/members");
  await expect(page.getByRole("heading", { name: "Members" })).toHaveCount(0);
  await context.close();
  await api.dispose();
});
