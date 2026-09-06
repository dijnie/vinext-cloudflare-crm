import { expect, test } from "@playwright/test";
import { getModuleDictionary } from "../../src/lib/i18n/module-dictionary";
import { getCrmDictionary } from "../../src/lib/i18n/crm-dictionary";
import type { ModuleSettings } from "../../src/lib/services/modules/module-contracts";

for (const locale of ["vi", "en"] as const) {
  test(`${locale}: owner disables company writes while history remains readable and restores editing`, async ({ page, baseURL }) => {
    const headers = { origin: baseURL! }; const labels = getModuleDictionary(locale); const crm = getCrmDictionary(locale);
    expect((await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD } })).ok()).toBe(true);
    const read = async () => { const result = await page.request.get("/api/crm/modules"); expect(result.ok()).toBe(true); return await result.json() as ModuleSettings; };
    const original = (await read()).modules.find(module => module.entity === "company")!;
    const setEnabled = async (enabled: boolean) => { const latest = (await read()).modules.find(module => module.entity === "company")!; expect((await page.request.patch("/api/crm/modules", { headers, data: { entity: "company", enabled, revision: latest.revision } })).ok()).toBe(true); };
    try {
      if (!original.enabled) await setEnabled(true);
      const name = `module-${locale}-${crypto.randomUUID().slice(0, 8)}`;
      const response = await page.request.post("/api/crm/companies", { headers, data: { name } }); expect(response.ok()).toBe(true); const company = await response.json();
      await page.goto(`/${locale}/crm/settings/modules`);
      await expect(page.getByRole("heading", { name: labels.title, exact: true })).toBeVisible();
      const companyToggle = page.getByRole("checkbox", { name: new RegExp(labels.entities.company) });
      await companyToggle.uncheck();
      expect((await read()).modules.find(module => module.entity === "company")!.enabled).toBe(true);
      await page.getByRole("button", { name: `${crm.save}: ${labels.entities.company}`, exact: true }).click();
      await expect(page.getByRole("status")).toContainText(labels.saved);
      await page.goto(`/${locale}/crm/companies?q=${name}`);
      await expect(page.getByText(labels.readOnly, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: crm.add, exact: true })).toBeDisabled();
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
      await page.getByRole("link", { name, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name, exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: `${crm.edit}: ${crm.labels.name}`, exact: true })).toBeDisabled();
      await dialog.getByRole("button", { name: crm.activities, exact: true }).click();
      await expect(dialog.getByRole("button", { name: crm.save, exact: true })).toBeDisabled();
      expect((await page.request.patch(`/api/crm/companies/${company.id}`, { headers, data: { action: "update", data: { name: `${name}-blocked` } } })).ok()).toBe(false);
      expect((await page.request.get(`/api/crm/companies/${company.id}`)).ok()).toBe(true);
      await page.goto(`/${locale}/crm/settings/modules`);
      await page.getByRole("checkbox", { name: new RegExp(labels.entities.company) }).check();
      await page.getByRole("button", { name: `${crm.save}: ${labels.entities.company}`, exact: true }).click();
      await expect(page.getByRole("status")).toContainText(labels.saved);
      await page.setViewportSize({ width: 375, height: 812 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`${locale}-module-settings-mobile.png`), animations: "disabled" });
      await page.goto(`/${locale}/crm/companies?q=${name}`);
      await expect(page.getByRole("button", { name: crm.add, exact: true })).toBeEnabled();
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
      await page.getByRole("link", { name, exact: true }).click();
      await dialog.getByRole("button", { name: locale === "vi" ? "Thao tác" : "More actions", exact: true }).click();
      await page.getByRole("menuitem", { name: crm.edit, exact: true }).click();
      const draft = `${name}-unsaved`;
      const nameInput = dialog.locator("#record-name");
      await nameInput.fill(draft);
      await setEnabled(false);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(dialog.getByRole("button", { name: crm.save, exact: true })).toBeDisabled();
      await expect(dialog.getByRole("button", { name: crm.cancel, exact: true })).toBeEnabled();
      await expect(nameInput).toHaveValue(draft);
      await expect(nameInput).toBeDisabled();
      await setEnabled(true);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(nameInput).toBeEnabled();
      await expect(nameInput).toHaveValue(draft);
      await expect(dialog.getByRole("button", { name: crm.save, exact: true })).toBeEnabled();
      await dialog.getByRole("button", { name: crm.cancel, exact: true }).click();
      await expect(dialog.getByRole("heading", { name, exact: true })).toBeVisible();
      expect((await (await page.request.get(`/api/crm/companies/${company.id}`)).json()).name).toBe(name);
    } finally { await setEnabled(original.enabled); }
  });
}

test("members can read module settings but cannot configure them", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  expect((await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_MEMBER_EMAIL, password: process.env.E2E_MEMBER_PASSWORD } })).ok()).toBe(true);
  const response = await page.request.get("/api/crm/modules"); expect(response.ok()).toBe(true); const settings = await response.json() as ModuleSettings;
  expect(settings.canManage).toBe(false);
  const company = settings.modules.find(module => module.entity === "company")!;
  expect((await page.request.patch("/api/crm/modules", { headers, data: { ...company, enabled: !company.enabled } })).status()).toBe(403);
  for (const locale of ["vi", "en"] as const) {
    await page.goto(`/${locale}/crm/settings/general`);
    await expect(page.getByRole("link", { name: getModuleDictionary(locale).title, exact: true })).toHaveCount(0);
    await page.goto(`/${locale}/crm/settings/modules`);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
  }
});
