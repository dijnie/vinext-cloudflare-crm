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
  await page.screenshot({ path: test.info().outputPath("auth-desktop.png") });
  await page.getByRole("button", { name: "Ngôn ngữ: EN" }).click();
  await expect(page).toHaveURL(/\/en\/sign-in\?source=e2e$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/en\/sign-in$/);
});

test("root locale defaults and invalid cookie fall back to Vietnamese", async ({ page, context, baseURL }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/vi\/sign-in$/);
  await context.addCookies([{ name: "crm_locale", value: "invalid", url: baseURL! }]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/vi\/sign-in$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
});

for (const locale of ["vi", "en"] as const) {
  test(`${locale}: every auth screen has localized heading and labels`, async ({ page }) => {
    const headings = locale === "vi"
      ? ["Đăng nhập", "Tạo tài khoản", "Kiểm tra email", "Khôi phục mật khẩu", "Đặt lại mật khẩu"]
      : ["Sign in", "Create an account", "Check your email", "Recover your password", "Reset your password"];
    const routes = ["sign-in", "sign-up", "verify-email", "forgot-password", "reset-password"];
    for (const [index, route] of routes.entries()) {
      await page.goto(`/${locale}/${route}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { name: headings[index], exact: true })).toBeVisible();
      if (route !== "reset-password") await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: locale === "vi" ? "Đổi mật khẩu" : "Reset password", exact: true })).toBeDisabled();
  });
  test(`${locale}: keyboard sign-in, mobile navigation and sign-out`, async ({ page }) => {
    const vi = locale === "vi";
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/${locale}/sign-in`);
    await page.screenshot({ path: test.info().outputPath(`${locale}-auth-mobile.png`) });
    await page.getByLabel("Email", { exact: true }).focus();
    await page.keyboard.type(requiredEnvironment("E2E_OWNER_EMAIL"));
    await page.keyboard.press("Tab");
    await expect(page.getByLabel(vi ? "Mật khẩu" : "Password", { exact: true })).toBeFocused();
    await page.keyboard.type(requiredEnvironment("E2E_OWNER_PASSWORD"));
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${locale}/crm/companies$`));
    const menu = page.getByRole("button", { name: vi ? "Mở menu" : "Open menu", exact: true });
    await menu.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(":focus")).toHaveCount(1);
    const settingsLink = dialog.getByRole("link", { name: vi ? "Cài đặt" : "Settings", exact: true });
    const focusableCount = await dialog.locator('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])').count();
    for (let step = 0; step <= focusableCount; step++) {
      await page.keyboard.press("Tab");
      await expect(dialog.locator(":focus")).toHaveCount(1);
      if (await settingsLink.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(settingsLink).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(menu).toBeFocused();
    await menu.press("Enter");
    await settingsLink.press("Enter");
    await page.getByRole("link", { name: vi ? "Thành viên" : "Members", exact: true }).click();
    await expect(page.getByRole("heading", { name: vi ? "Thành viên" : "Members", exact: true })).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const main = await page.locator("main").boundingBox();
    expect(main!.x + main!.width).toBeLessThanOrEqual(375);
    await page.getByRole("button", { name: vi ? "Menu tài khoản" : "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: vi ? "Đăng xuất" : "Sign out", exact: true }).press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in$`));
    await page.goto(`/${locale}/crm/settings/members`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in$`));
  });
}

async function signedInContext(browser: Browser, baseURL: string, emailName: string, passwordName: string) {
  const api = await createRequest.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { origin: baseURL } });
  const signIn = await api.post("/api/auth/sign-in/email", { data: { email: requiredEnvironment(emailName), password: requiredEnvironment(passwordName) } });
  expect(signIn.ok()).toBe(true);
  const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, storageState: await api.storageState() });
  return { api, context };
}

test("owner sees localized members and canonical stale slugs", async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("E2E_BASE_URL is required for preview E2E");
  const { api, context } = await signedInContext(browser, baseURL, "E2E_OWNER_EMAIL", "E2E_OWNER_PASSWORD");
  const members = await api.get("/api/crm/members");
  expect(members.status()).toBe(200);
  const page = await context.newPage();
  await page.goto("/vi/stale-workspace/settings/members?status=active&record=e2e-record");
  await expect(page).toHaveURL(/\/vi\/crm\/settings\/members\?status=active&record=e2e-record$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page.getByRole("heading", { name: "Thành viên" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Thành viên" })).toBeVisible();
  await page.getByRole("button", { name: "Ngôn ngữ: EN" }).click();
  await expect(page).toHaveURL(/\/en\/crm\/settings\/members\?status=active&record=e2e-record$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("members-desktop.png") });
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Dark mode", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({ path: test.info().outputPath("members-dark-desktop.png") });
  await context.close();
  await api.dispose();
});

test("page authorization rechecks membership after revocation", async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("E2E_BASE_URL is required for preview E2E");
  const owner = await signedInContext(browser, baseURL, "E2E_OWNER_EMAIL", "E2E_OWNER_PASSWORD");
  const member = await signedInContext(browser, baseURL, "E2E_DISPOSABLE_MEMBER_EMAIL", "E2E_DISPOSABLE_MEMBER_PASSWORD");
  try {
    const session = await member.api.get("/api/auth/get-session");
    expect(session.ok()).toBe(true);
    const memberId = (await session.json()).user.id;
    const page = await member.context.newPage();
    await page.goto("/en/crm/companies");
    await expect(page.locator("[data-list-heading]")).toHaveText("Companies");
    const removed = await owner.api.delete(`/api/crm/members/${memberId}`, { data: {} });
    expect(removed.ok()).toBe(true);
    await page.goto("/en/crm/contacts");
    await expect(page).toHaveURL(/\/en\/sign-in$/);
    await expect(page.locator("[data-list-heading]")).toHaveCount(0);
    expect((await member.api.get("/api/crm/companies")).status()).toBe(401);
  } finally {
    await owner.context.close(); await owner.api.dispose();
    await member.context.close(); await member.api.dispose();
  }
});

test("member cannot see or call owner-only member management", async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("E2E_BASE_URL is required for preview E2E");
  const { api, context } = await signedInContext(browser, baseURL, "E2E_MEMBER_EMAIL", "E2E_MEMBER_PASSWORD");
  const members = await api.get("/api/crm/members");
  expect(members.status()).toBe(403);
  expect(await members.json()).toMatchObject({ error: { code: "owner_required" } });
  const page = await context.newPage();
  for (const locale of ["vi", "en"]) {
    const label = locale === "vi" ? "Thành viên" : "Members";
    await page.goto(`/${locale}/crm/companies`);
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    await page.goto(`/${locale}/crm/settings/members`);
    await expect(page.getByRole("heading", { name: label, exact: true })).toHaveCount(0);
  }
  await context.close();
  await api.dispose();
});
