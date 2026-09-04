import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { getCrmDictionary } from "../../src/i18n/crm-dictionary";

test.use({ actionTimeout: 10_000 });

let api: APIRequestContext;
let ownerId: string;
test.beforeAll(async ({ baseURL }) => {
  api = await request.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { origin: baseURL! } });
  const signedIn = await api.post("/api/auth/sign-in/email", { data: { email: process.env["E2E_OWNER_EMAIL"], password: process.env["E2E_OWNER_PASSWORD"] } });
  expect(signedIn.ok()).toBe(true);
  const owners = await api.get("/api/crm/owners");
  expect(owners.ok()).toBe(true);
  ownerId = (await owners.json()).rows[0].membershipId;
});
test.beforeEach(async ({ context }) => { await context.addCookies((await api.storageState()).cookies); });
test.afterAll(async () => { await api?.dispose(); });

async function create(path: string, data: object): Promise<{ id: string }> {
  const response = await api.post(`/api/crm/${path}`, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function settled(page: Page) { await expect(page.locator("section[aria-busy]")).toHaveAttribute("aria-busy", "false"); }
async function query(page: Page, key: string, value: string | null) { await expect.poll(() => new URL(page.url()).searchParams.get(key)).toBe(value); }

for (const locale of ["vi", "en"] as const) {
  const labels = getCrmDictionary(locale);
  test(`${locale}: choosing a company survives searching other companies`, async ({ page }) => {
    const prefix = `choose-${locale}-${Date.now()}`;
    const first = await create("companies", { name: `${prefix}-first` });
    const chosen = await create("companies", { name: `${prefix}-chosen` });
    await page.goto(`/${locale}/crm/contacts`);
    await page.getByRole("button", { name: labels.add, exact: true }).click();
    const sheet = page.getByRole("dialog");
    await sheet.locator("#record-firstName").fill(prefix);
    await sheet.getByRole("textbox", { name: labels.chooseCompany, exact: true }).fill(`${prefix}-chosen`);
    await expect(sheet.locator(`#record-companyId option[value="${chosen.id}"]`)).toHaveCount(1);
    await sheet.locator("#record-companyId").selectOption(chosen.id);
    await sheet.getByRole("textbox", { name: labels.chooseCompany, exact: true }).fill(`${prefix}-first`);
    await expect(sheet.locator(`#record-companyId option[value="${first.id}"]`)).toHaveCount(1);
    await expect(sheet.locator("#record-companyId")).toHaveValue(chosen.id);
    await sheet.getByRole("button", { name: labels.save, exact: true }).click();
    await expect(sheet.getByRole("heading", { name: prefix, exact: true })).toBeVisible();
    const id = new URL(page.url()).searchParams.get("recordId");
    expect((await (await api.get(`/api/crm/contacts/${id}`)).json()).companyId).toBe(chosen.id);
  });
  test(`${locale}: create edit archive and restore all entity types`, async ({ page }) => {
    test.setTimeout(90_000);
    const prefix = `crud-${locale}-${Date.now()}`;
    const parent = await create("companies", { name: `${prefix}-parent` });
    for (const entity of ["companies", "contacts", "deals"] as const) {
      const name = `${prefix}-${entity}`;
      await page.goto(`/${locale}/crm/${entity}?q=${prefix}`);
      await settled(page);
      await page.getByRole("button", { name: labels.add, exact: true }).click();
      const sheet = page.getByRole("dialog");
      await sheet.locator(entity === "contacts" ? "#record-firstName" : "#record-name").fill(name);
      if (entity !== "companies") {
        await expect(sheet.locator("#record-companyId option", { hasText: `${prefix}-parent` })).toHaveCount(1);
        await sheet.locator("#record-companyId").selectOption(parent.id);
      }
      if (entity === "deals") {
        await expect(sheet.locator(`#record-ownerMembershipId option[value="${ownerId}"]`)).toHaveCount(1);
        await sheet.locator("#record-ownerMembershipId").selectOption(ownerId);
        await sheet.locator("#record-amountMinor").fill("12345");
      }
      await sheet.getByRole("button", { name: labels.save, exact: true }).click();
      await expect(sheet.getByRole("heading", { name, exact: true })).toBeVisible();
      const id = new URL(page.url()).searchParams.get("recordId")!;
      await sheet.getByRole("button", { name: labels.edit, exact: true }).click();
      if (entity === "deals") await expect(sheet.locator("#record-ownerMembershipId")).toHaveValue(ownerId);
      await sheet.locator(entity === "contacts" ? "#record-firstName" : "#record-name").fill(`${name}-edited`);
      await sheet.getByRole("button", { name: labels.save, exact: true }).click();
      await expect(sheet.getByRole("heading", { name: `${name}-edited`, exact: true })).toBeVisible();
      for (const action of ["archive", "restore"] as const) {
        await sheet.getByRole("button", { name: labels[action], exact: true }).click();
        await page.getByRole("button", { name: labels.confirm, exact: true }).click();
        await expect(page.getByRole("dialog")).toHaveCount(1);
        await expect.poll(async () => (await (await api.get(`/api/crm/${entity}/${id}`)).json()).archivedAt !== null).toBe(action === "archive");
        await expect(sheet.getByRole("button", { name: labels[action === "archive" ? "restore" : "archive"], exact: true })).toBeVisible();
      }
      await sheet.getByRole("button", { name: labels.close, exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await settled(page);
      await expect(page.getByRole("link", { name: `${name}-edited`, exact: true })).toBeVisible();
      await page.goBack();
      await expect(page.getByRole("dialog").getByRole("heading", { name: `${name}-edited`, exact: true })).toBeVisible();
      await page.goForward();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  });

  test(`${locale}: URL controls reset page and bulk changes only visible selected IDs`, async ({ page }) => {
    test.setTimeout(60_000);
    const prefix = `bulk-${locale}-${Date.now()}`;
    const ids: string[] = [];
    for (let index = 0; index < 5; index++) ids.push((await create("companies", { name: `${prefix}-${index}` })).id);
    const industryUpdate = await api.patch(`/api/crm/companies/${ids[0]}`, { data: { action: "update", data: { industry: `${prefix}-industry` } } });
    expect(industryUpdate.ok()).toBe(true);
    await page.goto(`/${locale}/crm/companies?q=${prefix}&pageSize=2&page=2&sort=name&dir=asc`);
    await settled(page);
    await page.getByRole("checkbox", { name: `${labels.select} ${prefix}-2`, exact: true }).check();
    await page.getByRole("button", { name: labels.next, exact: true }).click();
    await settled(page);
    await query(page, "page", "3");
    await expect(page.getByRole("button", { name: labels.archive, exact: true })).toHaveCount(0);
    await page.getByRole("checkbox", { name: `${labels.select} ${prefix}-4`, exact: true }).check();
    const bulkRequest = page.waitForRequest(req => req.method() === "PATCH" && new URL(req.url()).pathname === "/api/crm/companies");
    await page.getByRole("button", { name: labels.archive, exact: true }).click();
    await page.getByRole("button", { name: labels.confirm, exact: true }).click();
    expect((await bulkRequest).postDataJSON()).toEqual({ action: "bulk-archive", ids: [ids[4]] });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    for (const [index, id] of ids.entries()) expect((await (await api.get(`/api/crm/companies/${id}`)).json()).archivedAt !== null).toBe(index === 4);
    await page.getByRole("combobox", { name: labels.archived, exact: true }).selectOption("true");
    await query(page, "page", null);
    await settled(page);
    await page.getByRole("checkbox", { name: `${labels.select} ${prefix}-4`, exact: true }).check();
    await page.getByRole("button", { name: labels.restore, exact: true }).click();
    await page.getByRole("button", { name: labels.confirm, exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(async () => (await (await api.get(`/api/crm/companies/${ids[4]}`)).json()).archivedAt).toBeNull();
    await page.goto(`/${locale}/crm/companies?q=${prefix}&pageSize=2&page=2`);
    await page.getByRole("textbox", { name: labels.search, exact: true }).fill(`${prefix}-0`);
    await page.getByRole("button", { name: labels.search, exact: true }).click();
    await query(page, "page", null);
    await query(page, "q", `${prefix}-0`);
    await settled(page);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.goto(`/${locale}/crm/companies?q=${prefix}&pageSize=2&page=2`);
    await page.getByRole("combobox", { name: labels.sort, exact: true }).selectOption("name");
    await query(page, "page", null);
    await query(page, "sort", "name");
    await page.locator("summary", { hasText: labels.columns }).click();
    const domainColumn = page.getByRole("checkbox", { name: labels.labels.domain, exact: true });
    await expect(domainColumn).toBeChecked();
    await domainColumn.click();
    await query(page, "columns", "name,industry,owner,createdAt");
    await expect(domainColumn).not.toBeChecked();
    await expect(page.getByRole("columnheader", { name: labels.labels.domain, exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("columnheader", { name: labels.labels.domain, exact: true })).toHaveCount(0);
    await page.goto(`/${locale}/crm/companies?q=${prefix}&pageSize=2&page=2`);
    await settled(page);
    await page.locator("summary", { hasText: labels.filters }).click();
    const industryFilter = page.getByRole("checkbox", { name: new RegExp(`${prefix}-industry`) });
    await industryFilter.click();
    await query(page, "page", null);
    await query(page, "industry", `${prefix}-industry`);
    await expect(industryFilter).toBeChecked();
    await settled(page);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.getByRole("link", { name: `${prefix}-0`, exact: true })).toBeVisible();
  });

  test(`${locale}: related sheets retain list state through history direct links and mobile focus`, async ({ page }) => {
    const prefix = `links-${locale}-${Date.now()}`;
    const company = await create("companies", { name: prefix });
    const contact = await create("contacts", { firstName: `${prefix}-contact`, companyId: company.id });
    const deal = await create("deals", { name: `${prefix}-deal`, companyId: company.id, ownerMembershipId: ownerId, amountMinor: 500, currency: "USD" });
    await create(`deals/${deal.id}/contacts`, { contactId: contact.id, role: "decision-maker" });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/${locale}/crm/companies?q=${prefix}&sort=name&dir=asc&columns=name,domain`);
    await settled(page);
    const trigger = page.getByRole("link", { name: prefix, exact: true });
    await trigger.press("Enter");
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: prefix, exact: true })).toBeFocused();
    await sheet.getByRole("link", { name: `${prefix}-contact`, exact: true }).click();
    await query(page, "recordType", "contact");
    await sheet.getByRole("link", { name: `${prefix}-deal`, exact: true }).click();
    await query(page, "recordType", "deal");
    await query(page, "q", prefix);
    await query(page, "columns", "name,domain");
    await page.reload();
    await expect(sheet.getByRole("heading", { name: `${prefix}-deal`, exact: true })).toBeVisible();
    await page.goBack();
    await expect(sheet.getByRole("heading", { name: `${prefix}-contact`, exact: true })).toBeVisible();
    await page.goForward();
    await expect(sheet.getByRole("heading", { name: `${prefix}-deal`, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await sheet.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(page.locator("[data-list-heading]")).toBeFocused();
    await trigger.press("Enter");
    await expect(sheet.getByRole("heading", { name: prefix, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    for (const [path, id, name] of [["companies", company.id, prefix], ["contacts", contact.id, `${prefix}-contact`], ["deals", deal.id, `${prefix}-deal`]]) {
      await page.goto(`/${locale}/crm/${path}/${id}?q=${prefix}`);
      await query(page, "recordId", id!);
      await expect(sheet.getByRole("heading", { name, exact: true })).toBeVisible();
    }
    await page.goto(`/${locale}/crm/companies?recordType=company&recordId=00000000-0000-4000-8000-000000000001`);
    await expect(sheet.getByRole("alert")).toContainText(labels.missing);
    await page.goto(`/${locale}/crm/companies?sort=unknown`);
    await expect(page.getByRole("heading", { name: labels.invalidQuery, exact: true })).toBeVisible();
    await page.goto(`/${locale}/crm/companies?recordType=company&recordId=${company.id}&tab=fields`);
    await expect(page.getByRole("heading", { name: labels.invalidQuery, exact: true })).toBeVisible();
    await expect(sheet).toHaveCount(0);
  });
}
