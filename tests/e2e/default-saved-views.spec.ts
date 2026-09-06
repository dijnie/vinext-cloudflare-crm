import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { getCrmDictionary } from "../../src/lib/i18n/crm-dictionary";
import type { SavedView } from "../../src/lib/services/saved-views/saved-view-contracts";

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for preview E2E`);
  return value;
}
async function signIn(baseURL: string, role: "OWNER" | "MEMBER") {
  const api = await request.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { origin: baseURL } });
  expect((await api.post("/api/auth/sign-in/email", { data: { email: requiredEnvironment(`E2E_${role}_EMAIL`), password: requiredEnvironment(`E2E_${role}_PASSWORD`) } })).ok()).toBe(true);
  return api;
}
async function views(api: APIRequestContext) {
  const response = await api.get("/api/crm/saved-views?entity=company");
  expect(response.ok()).toBe(true);
  return await response.json() as SavedView[];
}
async function closeMenu(page: Page) { await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); }

for (const locale of ["vi", "en"] as const) {
  test(`${locale}: personal defaults preserve explicit navigation and shared-view creator permissions`, async ({ browser, baseURL }) => {
    if (!baseURL) throw new Error("E2E_BASE_URL is required");
    const labels = getCrmDictionary(locale);
    const owner = await signIn(baseURL, "OWNER");
    const member = await signIn(baseURL, "MEMBER");
    const ownerContext = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, storageState: await owner.storageState() });
    const memberContext = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, storageState: await member.storageState() });
    const page = await ownerContext.newPage();
    const memberPage = await memberContext.newPage();
    const prefix = `default-${locale}-${crypto.randomUUID().slice(0, 8)}`;
    const path = `/${locale}/crm/companies`;
    let viewId: string | undefined;
    let companyId: string | undefined;
    try {
      const companyResponse = await owner.post("/api/crm/companies", { data: { name: prefix } });
      expect(companyResponse.ok()).toBe(true);
      companyId = (await companyResponse.json()).id;
      await page.goto(`${path}?q=${prefix}`);
      await page.getByRole("button", { name: labels.views.title, exact: true }).click();
      await page.getByRole("menuitem", { name: labels.views.add, exact: true }).click();
      await page.getByLabel(labels.views.name, { exact: true }).fill(prefix);
      await page.getByLabel(labels.views.shared, { exact: true }).check();
      await page.getByRole("dialog").getByRole("button", { name: labels.save, exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      viewId = (await views(owner)).find(view => view.name === prefix)?.id;
      expect(viewId).toBeTruthy();
      await page.getByRole("button", { name: prefix, exact: true }).press("Enter");
      const ownOptions = page.getByRole("menuitem", { name: `${labels.edit} ${prefix}`, exact: true });
      await ownOptions.focus(); await ownOptions.press("ArrowRight");
      await page.getByRole("menuitem", { name: labels.views.setDefault, exact: true }).press("Enter");
      await expect.poll(async () => (await views(owner)).find(view => view.id === viewId)?.isDefault).toBe(true);
      await expect(page.getByText(labels.views.default, { exact: true })).toBeVisible();
      await closeMenu(page);
      await page.goto(path);
      await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe(viewId);
      await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(prefix);
      await expect(page.locator("tbody").getByRole("link", { name: prefix, exact: true })).toBeVisible();
      await page.goto(`${path}?q=${prefix}-missing`);
      await expect(page.locator("[data-list-heading]")).toBeVisible();
      expect(new URL(page.url()).searchParams.get("q")).toBe(`${prefix}-missing`);
      expect(new URL(page.url()).searchParams.has("view")).toBe(false);
      await page.goto(`${path}/${companyId}`);
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(new URL(page.url()).searchParams.get("recordId")).toBe(companyId);
      expect(new URL(page.url()).searchParams.has("view")).toBe(false);
      expect((await views(member)).some(view => view.isDefault)).toBe(false);
      await memberPage.setViewportSize({ width: 375, height: 812 });
      await memberPage.goto(path);
      const mobileControls = memberPage.getByRole("button", { name: labels.filters, exact: true }).and(memberPage.locator("[aria-controls]:not([aria-haspopup])"));
      await mobileControls.press("Enter");
      await expect(mobileControls).toHaveAttribute("aria-expanded", "true");
      await memberPage.getByRole("button", { name: labels.views.title, exact: true }).press("Enter");
      const memberOptions = memberPage.getByRole("menuitem", { name: `${labels.views.options} ${prefix}`, exact: true });
      await memberOptions.focus(); await memberOptions.press("ArrowRight");
      await expect(memberPage.getByRole("menuitem", { name: labels.edit, exact: true })).toHaveCount(0);
      await expect(memberPage.getByRole("menuitem", { name: labels.views.update, exact: true })).toHaveCount(0);
      await expect(memberPage.getByRole("menuitem", { name: labels.views.delete, exact: true })).toHaveCount(0);
      await memberPage.getByRole("menuitem", { name: labels.views.setDefault, exact: true }).press("Enter");
      await expect.poll(async () => (await views(member)).find(view => view.id === viewId)?.isDefault).toBe(true);
      expect(new URL(memberPage.url()).searchParams.has("view")).toBe(false);
      await expect(memberPage.getByText(labels.views.default, { exact: true })).toBeVisible();
      await memberPage.screenshot({ path: test.info().outputPath(`${locale}-default-view-mobile.png`), animations: "disabled" });
      expect(await memberPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await closeMenu(memberPage);
      await memberPage.goto(path);
      await expect.poll(() => new URL(memberPage.url()).searchParams.get("view")).toBe(viewId);
      await expect(memberPage.locator("tbody").getByRole("link", { name: prefix, exact: true })).toBeVisible();
      expect((await member.patch(`/api/crm/saved-views/${viewId}`, { data: { name: "Unauthorized rename" } })).status()).toBe(404);
      await page.goto(path);
      await page.getByRole("button", { name: prefix, exact: true }).click();
      await page.getByRole("menuitem", { name: `${labels.edit} ${prefix}`, exact: true }).hover();
      await page.getByRole("menuitem", { name: labels.views.clearDefault, exact: true }).click();
      await expect.poll(async () => (await views(owner)).some(view => view.isDefault)).toBe(false);
      expect((await views(member)).find(view => view.id === viewId)?.isDefault).toBe(true);
      await closeMenu(page);
      await page.getByRole("button", { name: prefix, exact: true }).click();
      await page.getByRole("menuitem", { name: `${labels.edit} ${prefix}`, exact: true }).hover();
      await page.getByRole("menuitem", { name: labels.edit, exact: true }).click();
      await page.getByLabel(labels.views.shared, { exact: true }).uncheck();
      await page.getByRole("dialog").getByRole("button", { name: labels.save, exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect((await views(member)).some(view => view.id === viewId || view.isDefault)).toBe(false);
      await memberPage.goto(path);
      await expect(memberPage.locator("[data-list-heading]")).toBeVisible();
      expect(new URL(memberPage.url()).searchParams.has("view")).toBe(false);
      expect(new URL(memberPage.url()).searchParams.has("q")).toBe(false);
    } finally {
      expect((await owner.put("/api/crm/saved-views/default", { data: { entity: "company", viewId: null } })).ok()).toBe(true);
      expect((await member.put("/api/crm/saved-views/default", { data: { entity: "company", viewId: null } })).ok()).toBe(true);
      if (viewId) expect((await owner.delete(`/api/crm/saved-views/${viewId}`, { headers: { "Content-Type": "application/json" } })).ok()).toBe(true);
      if (companyId) expect((await owner.patch("/api/crm/companies", { data: { action: "bulk-archive", ids: [companyId] } })).ok()).toBe(true);
      await ownerContext.close(); await memberContext.close(); await owner.dispose(); await member.dispose();
    }
  });
}
