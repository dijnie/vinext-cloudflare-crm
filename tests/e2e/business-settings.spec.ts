import { expect, test } from "@playwright/test";
import type { BusinessSettings } from "../../src/lib/services/settings/business-settings-contracts";

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for preview E2E`);
  return value;
}

test("owner saves the business calendar and recovers from a concurrent settings change", async ({ page, baseURL }) => {
  expect((await page.request.post("/api/auth/sign-in/email", { headers: { origin: baseURL! }, data: { email: requiredEnvironment("E2E_OWNER_EMAIL"), password: requiredEnvironment("E2E_OWNER_PASSWORD") } })).ok()).toBe(true);
  const read = async () => { const response = await page.request.get("/api/crm/settings"); expect(response.ok()).toBe(true); return await response.json() as BusinessSettings; };
  const original = await read();
  try {
    await page.goto("/vi/crm/settings/general");
    await expect(page.getByRole("heading", { name: "Cài đặt chung", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Ngôn ngữ: EN", exact: true }).click();
    await expect(page.getByRole("heading", { name: "General settings", exact: true })).toBeVisible();
    await page.getByLabel("Time zone", { exact: true }).fill("UTC");
    await page.getByLabel("Country code", { exact: true }).fill("US");
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Settings saved.");
    const saved = await read();
    expect(saved).toMatchObject({ timeZone: "UTC", countryCode: "US", canManage: true, revision: original.revision + 1 });
    await expect(page.locator("time")).toHaveAttribute("datetime", saved.today);
    await page.reload();
    await expect(page.getByLabel("Time zone", { exact: true })).toHaveValue("UTC");
    await expect(page.getByLabel("Country code", { exact: true })).toHaveValue("US");
    const concurrentChange = await page.request.patch("/api/crm/settings", { headers: { origin: baseURL! }, data: { timeZone: "Asia/Ho_Chi_Minh", countryCode: "VN", revision: saved.revision } });
    expect(concurrentChange.ok()).toBe(true);
    await page.getByLabel("Country code", { exact: true }).fill("GB");
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("Another owner changed these settings. Reload the latest settings before saving again.");
    await expect(page.getByRole("alert")).toBeFocused();
    await expect(page.getByRole("button", { name: "Save settings", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Reload settings", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Latest settings loaded.");
    await expect(page.getByLabel("Time zone", { exact: true })).toHaveValue("Asia/Ho_Chi_Minh");
    await expect(page.getByLabel("Country code", { exact: true })).toHaveValue("VN");
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("business-settings-mobile.png"), animations: "disabled" });
  } finally {
    const latest = await read();
    expect((await page.request.patch("/api/crm/settings", { headers: { origin: baseURL! }, data: { timeZone: original.timeZone, countryCode: original.countryCode, revision: latest.revision } })).ok()).toBe(true);
  }
});

test("member can read the business calendar but cannot edit it", async ({ page, baseURL }) => {
  expect((await page.request.post("/api/auth/sign-in/email", { headers: { origin: baseURL! }, data: { email: requiredEnvironment("E2E_MEMBER_EMAIL"), password: requiredEnvironment("E2E_MEMBER_PASSWORD") } })).ok()).toBe(true);
  const response = await page.request.get("/api/crm/settings");
  expect(response.ok()).toBe(true);
  const settings = await response.json() as BusinessSettings;
  expect(settings.canManage).toBe(false);
  for (const locale of ["vi", "en"]) {
    await page.goto(`/${locale}/crm/settings/general`);
    await expect(page.getByRole("link", { name: locale === "vi" ? "Cài đặt chung" : "General settings", exact: true })).toBeVisible();
    await expect(page.getByLabel(locale === "vi" ? "Múi giờ" : "Time zone", { exact: true })).toBeDisabled();
    await expect(page.getByLabel(locale === "vi" ? "Mã quốc gia" : "Country code", { exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: locale === "vi" ? "Lưu thiết lập" : "Save settings", exact: true })).toHaveCount(0);
  }
  const denied = await page.request.patch("/api/crm/settings", { headers: { origin: baseURL! }, data: { timeZone: "UTC", countryCode: "US", revision: settings.revision } });
  expect(denied.status()).toBe(403);
  expect(await denied.json()).toMatchObject({ error: { code: "owner_required" } });
});
