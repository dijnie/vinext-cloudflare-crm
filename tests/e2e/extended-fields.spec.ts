import { expect, test } from "@playwright/test";
import { getCrmDictionary } from "../../src/lib/i18n/crm-dictionary";
import { formatMinor } from "../../src/lib/services/currencies/currency-catalog";
import type { FieldDefinition } from "../../src/lib/services/custom-fields/field-contracts";

for (const locale of ["vi", "en"] as const) {
  test(`${locale}: five extended property editors persist and expose labeled table filters`, async ({ page, baseURL }) => {
    const labels = getCrmDictionary(locale);
    const response = await page.request.post("/api/auth/sign-in/email", { headers: { origin: baseURL! }, data: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD } });
    expect(response.ok()).toBe(true);
    const prefix = `extended-${locale}-${crypto.randomUUID().slice(0, 8)}`;
    const contactName = `${prefix}-customer`;
    const companyResponse = await page.request.post("/api/crm/companies", { headers: { origin: baseURL! }, data: { name: prefix } });
    expect(companyResponse.ok()).toBe(true);
    const company = await companyResponse.json();
    const contactResponse = await page.request.post("/api/crm/contacts", { headers: { origin: baseURL! }, data: { firstName: contactName } });
    expect(contactResponse.ok()).toBe(true);
    const contact = await contactResponse.json();
    const types = ["money", "multiselect", "multivalue", "rating", "customer"] as const;
    await page.goto(`/${locale}/crm/companies?q=${prefix}`);
    await page.getByRole("button", { name: labels.custom.manage, exact: true }).click();
    for (const type of types) {
      const sheet = page.getByRole("dialog");
      await sheet.getByRole("button", { name: labels.custom.add, exact: true }).click();
      await sheet.getByLabel(labels.custom.label, { exact: true }).fill(`${prefix}-${type}`);
      await sheet.locator("#custom-field-type").click();
      await page.locator(`[role="option"][data-value="${type}"]`).click();
      await sheet.getByLabel(labels.custom.showOnTable, { exact: true }).check();
      if (type === "multiselect" || type === "customer") await sheet.getByLabel(labels.custom.showOnFilter, { exact: true }).check();
      if (type === "multiselect") {
        for (const [index, choice] of ["Alpha", "Beta"].entries()) {
          await sheet.getByRole("button", { name: labels.custom.addOption, exact: true }).click();
          await sheet.getByLabel(`${labels.custom.options} ${index + 1}`, { exact: true }).fill(choice);
        }
      }
      if (type === "rating") await sheet.getByLabel(labels.custom.ratingMax, { exact: true }).fill("7");
      await sheet.getByRole("button", { name: labels.save, exact: true }).click();
      await expect(sheet.getByRole("button", { name: labels.custom.add, exact: true })).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const definitionsResponse = await page.request.get("/api/crm/fields?entity=company");
    expect(definitionsResponse.ok()).toBe(true);
    const definitions = await definitionsResponse.json() as FieldDefinition[];
    const field = (type: typeof types[number]) => {
      const definition = definitions.find(item => item.label === `${prefix}-${type}`);
      if (!definition) throw new Error(`Missing created ${type} field`);
      return definition;
    };
    expect(field("rating").config?.ratingMax).toBe(7);
    await page.goto(`/${locale}/crm/companies?q=${prefix}&recordType=company&recordId=${company.id}&tab=fields`);
    const dialog = page.getByRole("dialog");
    await dialog.locator(`#custom-${field("money").id}`).fill("125.50");
    await dialog.locator(`#custom-${field("money").id}-currency`).click();
    await page.locator('[role="option"][data-value="USD"]').click();
    const multi = dialog.locator(`#custom-${field("multiselect").id}`);
    await multi.getByLabel("Alpha", { exact: true }).check();
    await multi.getByLabel("Beta", { exact: true }).check();
    const values = dialog.locator(`#custom-${field("multivalue").id}`);
    await values.getByRole("button", { name: labels.custom.addValue, exact: true }).click();
    await values.getByRole("textbox").nth(0).fill("First value");
    await values.getByRole("button", { name: labels.custom.addValue, exact: true }).click();
    await values.getByRole("textbox").nth(1).fill("Second value");
    await dialog.locator(`#custom-${field("rating").id}`).fill("7");
    await dialog.locator(`#custom-${field("customer").id}`).click();
    await page.getByRole("combobox", { name: labels.custom.searchCustomers, exact: true }).fill(contactName);
    await page.getByRole("option", { name: contactName, exact: true }).click();
    await dialog.getByRole("button", { name: labels.save, exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText(labels.custom.saved);
    const storedResponse = await page.request.get(`/api/crm/fields/values?entity=company&recordId=${company.id}`);
    expect(storedResponse.ok()).toBe(true);
    expect(await storedResponse.json()).toMatchObject({
      [field("money").key]: { amountMinor: 12550, currency: "USD" },
      [field("multiselect").key]: field("multiselect").options.map(option => option.id),
      [field("multivalue").key]: ["First value", "Second value"],
      [field("rating").key]: 7,
      [field("customer").key]: contact.id,
    });
    await dialog.locator(`#custom-${field("money").id}`).fill("125.501");
    await dialog.locator(`#custom-${field("rating").id}`).fill("6");
    await dialog.getByRole("button", { name: labels.save, exact: true }).click();
    await expect(dialog.locator(`#custom-${field("money").id}`)).toBeFocused();
    await expect(dialog.getByRole("alert")).toHaveText(labels.custom.moneyInvalid);
    const blockedResponse = await page.request.get(`/api/crm/fields/values?entity=company&recordId=${company.id}`);
    expect(blockedResponse.ok()).toBe(true);
    expect(await blockedResponse.json()).toMatchObject({ [field("money").key]: { amountMinor: 12550, currency: "USD" }, [field("rating").key]: 7 });
    await dialog.locator(`#custom-${field("money").id}`).fill("125.50");
    await dialog.locator(`#custom-${field("rating").id}`).fill("7");
    await dialog.getByRole("button", { name: labels.save, exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText(labels.custom.saved);
    await page.reload();
    await expect(dialog.locator(`#custom-${field("money").id}`)).toHaveValue("125.50");
    await expect(dialog.locator(`#custom-${field("multiselect").id}`).getByLabel("Beta", { exact: true })).toBeChecked();
    await expect(dialog.locator(`#custom-${field("multivalue").id}`).getByRole("textbox").nth(1)).toHaveValue("Second value");
    await expect(dialog.locator(`#custom-${field("rating").id}`)).toHaveValue("7");
    await expect(dialog.locator(`#custom-${field("customer").id}`)).toHaveText(contactName);
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`${locale}-extended-fields-mobile.png`), animations: "disabled" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto(`/${locale}/crm/companies?q=${prefix}`);
    await expect(page.getByRole("cell", { name: formatMinor(12550, "USD", locale), exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "7 / 7", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: contactName, exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "First value, Second value", exact: true })).toBeVisible();
    await page.getByRole("button", { name: labels.filters, exact: true }).click();
    await page.getByRole("menuitem", { name: field("multiselect").label, exact: true }).hover();
    await page.getByRole("option", { name: /Alpha/ }).click();
    await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
    await page.getByRole("button", { name: labels.filters, exact: false }).last().click();
    await page.getByRole("menuitem", { name: field("customer").label, exact: true }).hover();
    await page.getByRole("option", { name: new RegExp(contactName) }).click();
    await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
    await expect.poll(() => JSON.parse(new URL(page.url()).searchParams.get("fields") ?? "{}")).toEqual({ [field("multiselect").key]: [field("multiselect").options[0]!.id], [field("customer").key]: [contact.id] });
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.reload();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.getByRole("cell", { name: contactName, exact: true })).toBeVisible();
  });
}
