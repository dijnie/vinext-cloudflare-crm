import { expect, test, type Locator } from "@playwright/test";
import { getCrmDictionary } from "../../src/lib/i18n/crm-dictionary";
import type { FieldDefinition } from "../../src/lib/services/custom-fields/field-contracts";
import type { SavedView } from "../../src/lib/services/saved-views/saved-view-contracts";

for (const locale of ["vi", "en"] as const) {
  test(`${locale}: typed conditions combine, cancel, clear and round-trip through default views`, async ({ page, baseURL }) => {
    const labels = getCrmDictionary(locale);
    const headers = { origin: baseURL! };
    expect((await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD } })).ok()).toBe(true);
    const prefix = `conditions-${locale}-${crypto.randomUUID().slice(0, 8)}`;
    async function field(type: "number" | "text", suffix: string) { const response = await page.request.post("/api/crm/fields", { headers, data: { entity: "company", type, label: `${prefix}-${suffix}`, showOnFilter: true } }); expect(response.ok()).toBe(true); return await response.json() as FieldDefinition; }
    const number = await field("number", "number");
    const text = await field("text", "text");
    const optional = await field("text", "optional");
    for (const [index, amount, content, note] of [[1, 10, "Match red", null], [2, 20, "Match blue", "Present"], [3, 5, "Other", null]] as const) {
      const response = await page.request.post("/api/crm/companies", { headers, data: { name: `${prefix}-${index}` } });
      expect(response.ok()).toBe(true);
      const record = await response.json();
      expect((await page.request.patch("/api/crm/fields/values", { headers, data: { entity: "company", recordId: record.id, values: { [number.key]: amount, [text.key]: content, [optional.key]: note } } })).ok()).toBe(true);
    }
    const path = `/${locale}/crm/companies`;
    const baseQuery = { q: prefix, sort: "name", dir: "asc", pageSize: "1", page: "2" };
    let viewId: string | undefined;
    async function addCondition(dialog: Locator, key: string, operator: string, value?: string) {
      await dialog.getByRole("button", { name: labels.custom.addCondition, exact: true }).click();
      const row = dialog.getByRole("group").last();
      await row.getByRole("combobox", { name: labels.custom.conditionField, exact: true }).click();
      await page.locator(`[role="option"][data-value="${key}"]`).click();
      await row.getByRole("combobox", { name: labels.custom.conditionOperator, exact: true }).click();
      await page.locator(`[role="option"][data-value="${operator}"]`).click();
      if (value !== undefined) await row.getByLabel(labels.custom.conditionValue, { exact: true }).fill(value);
    }
    try {
      await page.goto(`${path}?${new URLSearchParams(baseQuery)}`);
      await expect(page.locator("tbody").getByRole("link", { name: `${prefix}-2`, exact: true })).toBeVisible();
      await page.getByRole("button", { name: labels.custom.conditions, exact: true }).click();
      let dialog = page.getByRole("dialog");
      await addCondition(dialog, number.key, "gte", "10");
      await dialog.getByRole("button", { name: labels.cancel, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(new URL(page.url()).searchParams.has("criteria")).toBe(false);
      expect(new URL(page.url()).searchParams.get("page")).toBe("2");
      await page.getByRole("button", { name: labels.custom.conditions, exact: true }).click();
      dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("group")).toHaveCount(0);
      await addCondition(dialog, number.key, "gte", "10");
      await addCondition(dialog, text.key, "contains", "Match");
      await addCondition(dialog, optional.key, "empty");
      await dialog.getByRole("button", { name: labels.apply, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const expected = [{ key: number.key, operator: "gte", value: 10 }, { key: text.key, operator: "contains", value: "Match" }, { key: optional.key, operator: "empty" }];
      await expect.poll(() => JSON.parse(new URL(page.url()).searchParams.get("criteria") ?? "[]")).toEqual(expected);
      expect(new URL(page.url()).searchParams.get("page") ?? "1").toBe("1");
      await expect(page.locator("tbody").getByRole("link", { name: `${prefix}-1`, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: labels.next, exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: labels.views.title, exact: true }).click();
      await page.getByRole("menuitem", { name: labels.views.add, exact: true }).click();
      await page.getByRole("dialog").getByLabel(labels.views.name, { exact: true }).fill(prefix);
      await page.getByRole("dialog").getByRole("button", { name: labels.save, exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const views = await page.request.get("/api/crm/saved-views?entity=company");
      expect(views.ok()).toBe(true);
      const view = (await views.json() as SavedView[]).find(item => item.name === prefix)!; viewId = view.id;
      expect(JSON.parse(new URLSearchParams(view.state.query).get("criteria") ?? "[]")).toEqual(expected);
      await page.getByRole("button", { name: prefix, exact: true }).click();
      await page.getByRole("menuitem", { name: `${labels.edit} ${prefix}`, exact: true }).hover();
      await page.getByRole("menuitem", { name: labels.views.setDefault, exact: true }).click();
      await expect(page.getByText(labels.views.default, { exact: true })).toBeVisible();
      await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
      await page.goto(path);
      await expect.poll(() => JSON.parse(new URL(page.url()).searchParams.get("criteria") ?? "[]")).toEqual(expected);
      await expect(page.locator("tbody").getByRole("link", { name: `${prefix}-1`, exact: true })).toBeVisible();
      await page.setViewportSize({ width: 375, height: 812 });
      await page.getByRole("button", { name: new RegExp(labels.filters) }).and(page.locator("[aria-controls]:not([aria-haspopup])")).press("Enter");
      await page.getByRole("button", { name: `${labels.custom.conditions} (3)`, exact: true }).click();
      dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("group")).toHaveCount(3);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`${locale}-field-conditions-mobile.png`), animations: "disabled" });
      await dialog.getByRole("button", { name: labels.custom.clearConditions, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect.poll(() => new URL(page.url()).searchParams.has("criteria")).toBe(false);
      expect(new URL(page.url()).searchParams.get("q")).toBe(prefix);
      expect(new URL(page.url()).searchParams.get("sort")).toBe("name");
      await page.getByRole("button", { name: labels.next, exact: true }).click();
      await expect(page.locator("tbody").getByRole("link", { name: `${prefix}-2`, exact: true })).toBeVisible();
      await page.getByRole("button", { name: labels.custom.conditions, exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: labels.custom.clearConditions, exact: true }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get("page") ?? "1").toBe("1");
      await expect(page.locator("tbody").getByRole("link", { name: `${prefix}-1`, exact: true })).toBeVisible();
    } finally {
      expect((await page.request.put("/api/crm/saved-views/default", { headers, data: { entity: "company", viewId: null } })).ok()).toBe(true);
      if (viewId) expect((await page.request.delete(`/api/crm/saved-views/${viewId}`, { headers: { ...headers, "Content-Type": "application/json" } })).ok()).toBe(true);
    }
  });
}

for (const locale of ["vi", "en"] as const) {
  test(`${locale}: money, UTC date and archived customer conditions use typed controls`, async ({ page, baseURL }) => {
    const labels = getCrmDictionary(locale);
    const headers = { origin: baseURL! };
    expect((await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD } })).ok()).toBe(true);
    const prefix = `typed-conditions-${locale}-${crypto.randomUUID().slice(0, 8)}`;
    async function create(path: string, data: object) { const response = await page.request.post(`/api/crm/${path}`, { headers, data }); expect(response.ok()).toBe(true); return response.json(); }
    const money = await create("fields", { entity: "company", type: "money", label: `${prefix}-money`, showOnFilter: true }) as FieldDefinition;
    const date = await create("fields", { entity: "company", type: "date", label: `${prefix}-date`, showOnFilter: true }) as FieldDefinition;
    const customer = await create("fields", { entity: "company", type: "customer", label: `${prefix}-customer`, showOnFilter: true }) as FieldDefinition;
    const contact = await create("contacts", { firstName: `${prefix}-archived` });
    const other = await create("contacts", { firstName: `${prefix}-other` });
    for (const [suffix, currency, timestamp, contactId] of [
      ["match", "USD", "2026-09-06T12:34:56.000Z", contact.id],
      ["currency", "EUR", "2026-09-06T12:34:56.000Z", contact.id],
      ["date", "USD", "2026-09-07T00:00:00.000Z", contact.id],
      ["customer", "USD", "2026-09-06T12:34:56.000Z", other.id],
    ] as const) {
      const record = await create("companies", { name: `${prefix}-${suffix}` });
      expect((await page.request.patch("/api/crm/fields/values", { headers, data: { entity: "company", recordId: record.id, values: { [money.key]: { amountMinor: 1234, currency }, [date.key]: timestamp, [customer.key]: contactId } } })).ok()).toBe(true);
    }
    expect((await page.request.patch(`/api/crm/contacts/${contact.id}`, { headers, data: { action: "archive" } })).ok()).toBe(true);
    await page.goto(`/${locale}/crm/companies?q=${prefix}`);
    await expect(page.locator("tbody tr")).toHaveCount(4);
    await page.getByRole("button", { name: labels.custom.conditions, exact: true }).click();
    const dialog = page.getByRole("dialog");
    async function add(field: FieldDefinition) {
      await dialog.getByRole("button", { name: labels.custom.addCondition, exact: true }).click();
      const row = dialog.getByRole("group").last();
      await row.getByRole("combobox", { name: labels.custom.conditionField, exact: true }).click();
      await page.locator(`[role="option"][data-value="${field.key}"]`).click();
      await row.getByRole("combobox", { name: labels.custom.conditionOperator, exact: true }).click();
      await page.locator('[role="option"][data-value="eq"]').click();
      return row;
    }
    const moneyRow = await add(money);
    await moneyRow.getByLabel(labels.custom.conditionValue, { exact: true }).fill("12.34");
    await moneyRow.locator('[id$="-currency"]').click();
    await page.locator('[role="option"][data-value="USD"]').click();
    const dateRow = await add(date);
    await dateRow.getByLabel(labels.custom.conditionValue, { exact: true }).fill("2026-09-06");
    const customerRow = await add(customer);
    await customerRow.locator('button[id^="condition-value-"]').click();
    await page.getByLabel(labels.custom.browseArchivedCustomers, { exact: true }).check();
    await page.getByRole("combobox", { name: labels.custom.searchCustomers, exact: true }).fill(`${prefix}-archived`);
    await page.getByRole("option", { name: `${prefix}-archived`, exact: true }).click();
    await expect(customerRow.locator('button[id^="condition-value-"]')).toContainText(labels.archived);
    await dialog.getByRole("button", { name: labels.apply, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const expected = [
      { key: money.key, operator: "eq", value: { amountMinor: 1234, currency: "USD" } },
      { key: date.key, operator: "eq", value: "2026-09-06" },
      { key: customer.key, operator: "eq", value: contact.id },
    ];
    await expect.poll(() => JSON.parse(new URL(page.url()).searchParams.get("criteria") ?? "[]")).toEqual(expected);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody").getByRole("link", { name: `${prefix}-match`, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody").getByRole("link", { name: `${prefix}-match`, exact: true })).toBeVisible();
  });
}
