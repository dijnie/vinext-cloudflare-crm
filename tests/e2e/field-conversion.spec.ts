import { expect, test } from "@playwright/test";
import { getCrmDictionary } from "../../src/lib/i18n/crm-dictionary";
import type { FieldDefinition } from "../../src/lib/services/custom-fields/field-contracts";

for (const locale of ["vi", "en"] as const) {
  test(`${locale}: preview blocks fractional ratings and stale values before explicit conversion`, async ({ page, baseURL }) => {
    const labels = getCrmDictionary(locale);
    const headers = { origin: baseURL! };
    expect((await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD } })).ok()).toBe(true);
    const prefix = `convert-${locale}-${crypto.randomUUID().slice(0, 8)}`;
    const fieldResponse = await page.request.post("/api/crm/fields", { headers, data: { entity: "company", type: "number", label: prefix, showOnTable: true } });
    expect(fieldResponse.ok()).toBe(true);
    const field = await fieldResponse.json() as FieldDefinition;
    const ids: string[] = [];
    for (const [index, value] of [2, 2.5].entries()) {
      const created = await page.request.post("/api/crm/companies", { headers, data: { name: `${prefix}-${index}` } });
      expect(created.ok()).toBe(true);
      const record = await created.json(); ids.push(record.id);
      expect((await page.request.patch("/api/crm/fields/values", { headers, data: { entity: "company", recordId: record.id, values: { [field.key]: value } } })).ok()).toBe(true);
    }
    const setValue = async (value: number) => { expect((await page.request.patch("/api/crm/fields/values", { headers, data: { entity: "company", recordId: ids[1], values: { [field.key]: value } } })).ok()).toBe(true); };
    await page.goto(`/${locale}/crm/companies?q=${prefix}`);
    await page.getByRole("button", { name: labels.custom.manage, exact: true }).click();
    const row = page.getByRole("dialog").locator("li").filter({ hasText: prefix });
    await row.getByRole("button", { name: `${labels.edit}: ${prefix}`, exact: true }).click();
    await page.getByRole("menuitem", { name: labels.custom.convert, exact: true }).click();
    const dialog = page.getByRole("dialog").last();
    await expect(dialog.getByRole("heading", { name: `${labels.custom.convert} · ${prefix}`, exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: labels.custom.applyConversion, exact: true })).toBeDisabled();
    await dialog.locator("#conversion-target-type").click();
    await page.locator('[role="option"][data-value="rating"]').click();
    await dialog.getByLabel(labels.custom.ratingMax, { exact: true }).fill("5");
    await dialog.getByRole("button", { name: labels.custom.conversionPreview, exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(labels.custom.conversionReasons.invalid_target_value);
    await expect(dialog.getByText(labels.custom.conversionTotal, { exact: true }).locator("..").locator("dd")).toHaveText("2");
    await expect(dialog.getByText(labels.custom.conversionReady, { exact: true }).locator("..").locator("dd")).toHaveText("1");
    await expect(dialog.getByText(labels.custom.conversionRejected, { exact: true }).locator("..").locator("dd")).toHaveText("1");
    await expect(dialog.getByRole("button", { name: labels.custom.applyConversion, exact: true })).toBeDisabled();
    const rejectedValue = await page.request.get(`/api/crm/fields/values?entity=company&recordId=${ids[1]}`);
    expect(rejectedValue.ok()).toBe(true);
    expect((await rejectedValue.json())[field.key]).toBe(2.5);
    await setValue(3);
    await dialog.getByRole("button", { name: labels.custom.conversionPreview, exact: true }).click();
    await expect(dialog.getByRole("button", { name: labels.custom.applyConversion, exact: true })).toBeEnabled();
    await setValue(4);
    await dialog.getByRole("button", { name: labels.custom.applyConversion, exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText(labels.custom.conversionStale);
    await expect(dialog.getByRole("button", { name: labels.custom.applyConversion, exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: labels.custom.refreshPreview, exact: true }).click();
    await expect(dialog.getByRole("button", { name: labels.custom.applyConversion, exact: true })).toBeEnabled();
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`${locale}-field-conversion-mobile.png`), animations: "disabled" });
    await dialog.getByRole("button", { name: labels.custom.applyConversion, exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    const list = await page.request.get("/api/crm/fields?entity=company");
    expect(list.ok()).toBe(true);
    expect((await list.json() as FieldDefinition[]).find(item => item.id === field.id)).toMatchObject({ type: "rating", key: field.key, config: { ratingMax: 5 } });
    const stored = await page.request.get(`/api/crm/fields/values?entity=company&recordId=${ids[1]}`);
    expect(stored.ok()).toBe(true);
    expect((await stored.json())[field.key]).toBe(4);
    await page.keyboard.press("Escape");
    await page.goto(`/${locale}/crm/companies?q=${prefix}&recordType=company&recordId=${ids[1]}&tab=fields`);
    await expect(page.getByRole("dialog").locator(`#custom-${field.id}`)).toHaveValue("4");
    await expect(page.getByRole("dialog").locator(`#custom-${field.id}`)).toHaveAttribute("max", "5");
  });
}
