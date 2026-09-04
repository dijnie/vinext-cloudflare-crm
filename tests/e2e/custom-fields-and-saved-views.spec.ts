import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { FIELD_TYPES, type FieldDefinition } from "../../src/fields/field-contracts";
import { getCrmDictionary } from "../../src/i18n/crm-dictionary";

test.use({ actionTimeout: 10_000 });
let api: APIRequestContext;
let member: APIRequestContext;
let ownerId: string;
let memberId: string;
const paths = { company: "companies", contact: "contacts", deal: "deals" } as const;
test.beforeAll(async ({ baseURL }) => {
  async function signIn(role: "OWNER" | "MEMBER") {
    const client = await request.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { origin: baseURL! } });
    expect((await client.post("/api/auth/sign-in/email", { data: { email: process.env[`E2E_${role}_EMAIL`], password: process.env[`E2E_${role}_PASSWORD`] } })).ok()).toBe(true);
    return client;
  }
  api = await signIn("OWNER"); member = await signIn("MEMBER");
  const { rows } = await (await api.get("/api/crm/owners")).json();
  ownerId = rows.find((row: { email: string }) => row.email === process.env["E2E_OWNER_EMAIL"]).membershipId;
  memberId = rows.find((row: { email: string }) => row.email === process.env["E2E_MEMBER_EMAIL"]).membershipId;
});
test.beforeEach(async ({ context }) => { await context.addCookies((await api.storageState()).cookies); });
test.afterAll(async () => { await api?.dispose(); await member?.dispose(); });
async function create(path: string, data: object, client = api) {
  const response = await client.post(`/api/crm/${path}`, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function settled(page: Page) { await expect(page.locator("section[aria-busy]").first()).toHaveAttribute("aria-busy", "false"); }

for (const locale of ["vi", "en"] as const) {
  const labels = getCrmDictionary(locale);
  test(`${locale}: all ten field editors persist typed values across three entities and reload`, async ({ page }) => {
    test.setTimeout(120_000);
    const prefix = `typed-${locale}-${Date.now()}`;
    const company = await create("companies", { name: prefix });
    for (const entity of ["company", "contact", "deal"] as const) {
      const record = entity === "company" ? company : await create(paths[entity], entity === "contact" ? { firstName: prefix, companyId: company.id } : { name: prefix, companyId: company.id, ownerMembershipId: ownerId });
      const definitions: FieldDefinition[] = [];
      for (const type of FIELD_TYPES) definitions.push(await create("fields", { entity, type, label: `${prefix}-${entity}-${type}`, showOnTable: true, showOnFilter: ["select", "user"].includes(type), options: type === "select" ? [{ label: "Choice A" }, { label: "Choice B" }] : [] }));
      await page.goto(`/${locale}/crm/${paths[entity]}?recordType=${entity}&recordId=${record.id}&tab=fields`);
      const dialog = page.getByRole("dialog");
      const expected: Record<string, string | number | boolean> = {};
      for (const field of definitions) {
        const input = dialog.locator(`#custom-${field.id}`);
        const values = { text: "A real property", long_text: "First line\nSecond line", number: 0, date: "2030-01-02", checkbox: false, select: field.options[0]?.id ?? "", url: "https://example.invalid/property", email: "field@example.invalid", phone: "+84000000000", user: memberId };
        const value = values[field.type]; expected[field.key] = value;
        if (["select", "user", "checkbox"].includes(field.type)) {
          if (field.type === "user") await expect(input).toHaveAttribute("aria-busy", "false");
          await input.selectOption(String(value));
        } else await input.fill(String(value));
      }
      await dialog.getByRole("button", { name: labels.save, exact: true }).click();
      await expect(dialog.getByRole("status")).toHaveText(labels.custom.saved);
      const stored = await (await api.get(`/api/crm/fields/values?entity=${entity}&recordId=${record.id}`)).json();
      expect(stored).toMatchObject(Object.fromEntries(definitions.map(field => [field.key, field.type === "date" ? `${expected[field.key]}T00:00:00.000Z` : expected[field.key]])));
      await page.reload();
      for (const field of definitions) await expect(dialog.locator(`#custom-${field.id}`)).toHaveValue(String(expected[field.key]));
      const number = definitions.find(field => field.type === "number")!;
      await dialog.locator(`#custom-${number.id}`).fill("12.75");
      await dialog.getByRole("button", { name: labels.save, exact: true }).click();
      await expect(dialog.getByRole("status")).toHaveText(labels.custom.saved);
      expect((await (await api.get(`/api/crm/fields/values?entity=${entity}&recordId=${record.id}`)).json())[number.key]).toBe(12.75);
      await page.setViewportSize({ width: 375, height: 812 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.locator("[data-list-heading]")).toBeFocused();
      await page.setViewportSize({ width: 1280, height: 800 });
      const select = definitions.find(field => field.type === "select")!;
      const user = definitions.find(field => field.type === "user")!;
      await page.goto(`/${locale}/crm/${paths[entity]}?q=${prefix}`);
      await settled(page);
      await expect(page.getByRole("columnheader", { name: select.label, exact: true })).toBeVisible();
      await page.locator("summary", { hasText: labels.filters }).click();
      const selectFilter = page.getByRole("group", { name: select.label, exact: true }).getByRole("checkbox", { name: "Choice A", exact: false });
      await selectFilter.click();
      await expect(selectFilter).toBeChecked();
      await settled(page);
      const userFilter = page.getByRole("group", { name: user.label, exact: true }).getByRole("checkbox");
      await userFilter.click();
      await expect(userFilter).toBeChecked();
      await expect.poll(() => JSON.parse(new URL(page.url()).searchParams.get("fields")!)).toEqual({ [select.key]: [select.options[0]!.id], [user.key]: [memberId] });
      await page.locator("summary", { hasText: labels.columns }).click();
      const numberColumn = page.getByRole("checkbox", { name: number.label, exact: true });
      await numberColumn.click();
      await expect(numberColumn).not.toBeChecked();
      await page.reload(); await settled(page);
      await expect(page.locator("tbody tr")).toHaveCount(1);
      await expect(page.getByRole("columnheader", { name: number.label, exact: true })).toHaveCount(0);
      expect((await api.patch(`/api/crm/fields/${user.id}`, { data: { action: "update", data: { showOnFilter: false } } })).ok()).toBe(true);
      await page.goto(`/${locale}/crm/${paths[entity]}?q=${prefix}&columns=field:${user.key}`);
      await settled(page);
      await expect(page.locator("tbody tr").getByRole("cell", { name: "member", exact: true })).toBeVisible();
      await expect(page.locator("tbody")).not.toContainText(memberId);
    }
  });

  test(`${locale}: manage definitions rename reorder archive restore and protected recoverable deletion`, async ({ page }) => {
    test.setTimeout(90_000);
    const label = `managed-${locale}-${Date.now()}`;
    await create("fields", { entity: "company", type: "text", label: `${label}-anchor` });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/${locale}/crm/companies`);
    await page.getByRole("button", { name: labels.custom.manage, exact: true }).press("Enter");
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: labels.custom.add, exact: true }).click();
    await sheet.getByLabel(labels.custom.label, { exact: true }).fill("   ");
    await sheet.getByRole("button", { name: labels.save, exact: true }).click();
    await expect(sheet.getByRole("alert")).toHaveText(labels.invalid);
    await sheet.getByLabel(labels.custom.label, { exact: true }).fill(label);
    await sheet.getByRole("button", { name: labels.save, exact: true }).click();
    const row = sheet.locator("li").filter({ has: page.getByRole("heading", { name: label, exact: true }) });
    await expect(row).toBeVisible();
    const definitions: FieldDefinition[] = await (await api.get("/api/crm/fields?entity=company&includeArchived=true")).json();
    const field = definitions.find(value => value.label === label)!;
    const record = await create("companies", { name: label });
    expect((await api.patch("/api/crm/fields/values", { data: { entity: "company", recordId: record.id, values: { [field.key]: "Preserved value" } } })).ok()).toBe(true);
    await row.getByRole("button", { name: `${labels.custom.up}: ${label}`, exact: true }).click();
    await expect.poll(async () => (await (await api.get("/api/crm/fields?entity=company&includeArchived=true")).json()).find((value: FieldDefinition) => value.id === field.id).position).toBe(field.position - 1);
    await row.getByRole("button", { name: labels.edit, exact: true }).click();
    await sheet.getByLabel(labels.custom.label, { exact: true }).fill(`${label}-renamed`);
    await sheet.getByRole("button", { name: labels.save, exact: true }).click();
    const renamed = sheet.locator("li").filter({ has: page.getByRole("heading", { name: `${label}-renamed`, exact: true }) });
    await expect(renamed).toContainText(field.key);
    await renamed.getByRole("button", { name: labels.archive, exact: true }).click();
    await renamed.getByRole("button", { name: labels.restore, exact: true }).click();
    await renamed.getByRole("button", { name: labels.custom.delete, exact: true }).click();
    const confirm = page.getByRole("dialog").last();
    await expect(confirm.getByRole("status")).toContainText("1 /");
    await confirm.getByLabel(labels.custom.password, { exact: true }).fill("incorrect-password");
    await confirm.locator('input:not([type="password"])').fill("incorrect-key");
    await expect(confirm.getByRole("button", { name: labels.custom.delete, exact: true })).toBeDisabled();
    await confirm.locator('input:not([type="password"])').fill(field.key);
    await confirm.getByRole("button", { name: labels.custom.delete, exact: true }).click();
    await expect(confirm.getByRole("alert")).toBeVisible();
    await confirm.getByLabel(labels.custom.password, { exact: true }).fill(process.env["E2E_OWNER_PASSWORD"]!);
    await confirm.getByRole("button", { name: labels.custom.delete, exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(renamed).toHaveCount(0);
    await sheet.locator("summary", { hasText: labels.custom.recover }).click();
    await expect(sheet.getByLabel(labels.custom.recoverId, { exact: true })).toHaveValue(field.id);
    await sheet.locator("details").getByRole("button", { name: labels.restore, exact: true }).click();
    await expect(renamed).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await (await api.get(`/api/crm/fields/values?entity=company&recordId=${record.id}`)).json())[field.key]).toBe("Preserved value");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: labels.custom.manage, exact: true })).toBeFocused();
  });

  test(`${locale}: private shared creator-only views apply columns and filters after reload`, async ({ page, browser, baseURL }) => {
    const prefix = `views-${locale}-${Date.now()}`;
    const field: FieldDefinition = await create("fields", { entity: "company", label: prefix, type: "select", showOnFilter: true, options: [{ label: "Selected" }] });
    const record = await create("companies", { name: prefix });
    expect((await api.patch("/api/crm/fields/values", { data: { entity: "company", recordId: record.id, values: { [field.key]: field.options[0]!.id } } })).ok()).toBe(true);
    const query = new URLSearchParams({ q: prefix, columns: `name,field:${field.key}`, fields: JSON.stringify({ [field.key]: [field.options[0]!.id] }), sort: "name", dir: "asc" });
    await page.goto(`/${locale}/crm/companies?${query}`);
    await page.locator("summary", { hasText: labels.views.title }).press("Enter");
    for (const shared of [false, true]) {
      await page.getByRole("button", { name: labels.views.add, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("button", { name: labels.save, exact: true })).toBeDisabled();
      await dialog.getByLabel(labels.views.name, { exact: true }).fill(`${prefix}-${shared ? "shared" : "private"}`);
      await dialog.getByLabel(labels.views.shared, { exact: true }).setChecked(shared);
      await dialog.getByRole("button", { name: labels.save, exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
    const views = await (await api.get("/api/crm/saved-views?entity=company")).json();
    const shared = views.find((view: { name: string }) => view.name === `${prefix}-shared`);
    const privateView = views.find((view: { name: string }) => view.name === `${prefix}-private`);
    const memberContext = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, storageState: await member.storageState() });
    try {
      const memberPage = await memberContext.newPage();
      await memberPage.goto(`/${locale}/crm/companies`);
      await memberPage.locator("summary", { hasText: labels.views.title }).click();
      await expect(memberPage.getByRole("button", { name: shared.name, exact: true })).toBeVisible();
      await expect(memberPage.getByRole("button", { name: privateView.name, exact: true })).toHaveCount(0);
      const sharedRow = memberPage.getByRole("button", { name: shared.name, exact: true }).locator("..");
      await expect(sharedRow.getByRole("button", { name: labels.edit, exact: true })).toHaveCount(0);
      expect((await member.patch(`/api/crm/saved-views/${shared.id}`, { data: { shared: false } })).ok()).toBe(false);
      expect((await member.delete(`/api/crm/saved-views/${shared.id}`, { headers: { "Content-Type": "application/json" } })).status()).toBe(404);
      await memberPage.getByRole("button", { name: shared.name, exact: true }).click();
      await expect.poll(() => new URL(memberPage.url()).searchParams.get("columns")).toBe(query.get("columns"));
      await expect.poll(() => new URL(memberPage.url()).searchParams.get("fields")).toBe(query.get("fields"));
      await memberPage.reload(); await settled(memberPage);
      await expect(memberPage.locator("tbody tr")).toHaveCount(1);
      await expect(memberPage.getByRole("columnheader", { name: field.label, exact: true })).toBeVisible();
      await memberPage.locator("summary", { hasText: shared.name }).click();
      await memberPage.getByRole("button", { name: labels.views.add, exact: true }).click();
      await memberPage.getByLabel(labels.views.name, { exact: true }).fill(`${prefix}-member`);
      await memberPage.getByLabel(labels.views.shared, { exact: true }).check();
      await memberPage.getByRole("dialog").getByRole("button", { name: labels.save, exact: true }).click();
      await expect(memberPage.getByRole("dialog")).toHaveCount(0);
      const memberView = (await (await member.get("/api/crm/saved-views?entity=company")).json()).find((view: { name: string }) => view.name === `${prefix}-member`);
      expect((await api.delete(`/api/crm/saved-views/${memberView.id}`, { headers: { "Content-Type": "application/json" } })).status()).toBe(404);
      const ownRow = memberPage.getByRole("button", { name: memberView.name, exact: true }).locator("..");
      await memberPage.getByRole("textbox", { name: labels.search, exact: true }).fill(`${prefix}-missing`);
      await memberPage.getByRole("button", { name: labels.search, exact: true }).click();
      await expect.poll(() => new URL(memberPage.url()).searchParams.get("q")).toBe(`${prefix}-missing`);
      await ownRow.getByRole("button", { name: labels.views.update, exact: true }).click();
      await expect.poll(async () => (await (await member.get("/api/crm/saved-views?entity=company")).json()).find((view: { id: string }) => view.id === memberView.id).state.query).toContain(`q=${prefix}-missing`);
      await ownRow.getByRole("button", { name: labels.edit, exact: true }).click();
      await memberPage.getByLabel(labels.views.shared, { exact: true }).uncheck();
      await memberPage.getByRole("dialog").getByRole("button", { name: labels.save, exact: true }).click();
      await expect(memberPage.getByRole("dialog")).toHaveCount(0);
      expect((await (await api.get("/api/crm/saved-views?entity=company")).json()).some((view: { id: string }) => view.id === memberView.id)).toBe(false);
      await ownRow.getByRole("button", { name: labels.views.delete, exact: true }).click();
      await memberPage.getByRole("dialog").getByRole("button", { name: labels.views.delete, exact: true }).click();
      await expect(ownRow).toHaveCount(0);
    } finally { await memberContext.close(); }
    await page.getByRole("button", { name: labels.custom.manage, exact: true }).click();
    const fieldRow = page.getByRole("dialog").locator("li").filter({ has: page.getByRole("heading", { name: field.label, exact: true }) });
    await fieldRow.getByRole("button", { name: labels.archive, exact: true }).click();
    await expect(fieldRow.getByRole("button", { name: labels.restore, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("alert")).toContainText(labels.error);
    await expect(page.locator("tbody").getByRole("link", { name: prefix, exact: true })).toHaveCount(0);
    await expect(page.locator("tbody")).toHaveText(labels.empty);
    await expect(page.getByRole("alert").getByRole("button", { name: labels.reset, exact: true })).toBeVisible();
    await page.goto(`/${locale}/crm/companies?${query}&view=${shared.id}`);
    await expect(page.getByRole("heading", { name: labels.invalidQuery, exact: true })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: labels.invalidQuery, exact: true })).toBeVisible();
    await page.getByRole("link", { name: labels.reset, exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("fields")).toBeNull();
    await settled(page);
  });
}
