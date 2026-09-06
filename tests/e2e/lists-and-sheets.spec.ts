import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { getCrmDictionary } from "../../src/lib/i18n/crm-dictionary";

test.use({ actionTimeout: 10_000 });

let api: APIRequestContext;
let ownerId: string;
test.beforeAll(async ({ baseURL }) => {
  api = await request.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { origin: baseURL! } });
  const signedIn = await api.post("/api/auth/sign-in/email", { data: { email: process.env["E2E_OWNER_EMAIL"], password: process.env["E2E_OWNER_PASSWORD"] } });
  expect(signedIn.ok()).toBe(true);
  const owners = await api.get("/api/crm/owners");
  expect(owners.ok()).toBe(true);
  const owner = (await owners.json()).rows.find((row: { email: string }) => row.email === process.env["E2E_OWNER_EMAIL"]);
  expect(owner, "The named owner fixture must remain active").toBeDefined();
  ownerId = owner.membershipId;
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

function trackCompanyRequests(page: Page) {
  const requests = { lists: [] as string[], layouts: [] as string[], foregroundPages: [] as string[], recordPages: [] as string[] };
  page.on("request", req => {
    if (req.method() !== "GET") return;
    const url = new URL(req.url());
    if (url.pathname === "/api/crm/companies") requests.lists.push(req.url());
    if (url.pathname === "/api/crm/layouts") requests.layouts.push(req.url());
    if (url.pathname !== "/en/crm/companies") return;
    if (url.searchParams.has("recordId")) requests.recordPages.push(req.url());
    const headers = req.headers();
    // Sidebar prefetch is independent of the foreground query navigation.
    if (headers["next-router-prefetch"] !== "1" && headers["next-router-segment-prefetch"] !== "1") requests.foregroundPages.push(req.url());
  });
  return requests;
}

test("SSR list avoids a duplicate fetch and refreshes after mutation and query navigation", async ({ page }) => {
  const labels = getCrmDictionary("en");
  const prefix = `snapshot-${Date.now()}`;
  const company = await create("companies", { name: `${prefix}-before` });
  const requests = trackCompanyRequests(page);
  const listRequests = requests.lists;
  await page.goto(`/en/crm/companies?q=${prefix}`);
  await expect(page.getByRole("link", { name: `${prefix}-before`, exact: true })).toBeVisible();
  await expect(page.locator("header").first()).toHaveCSS("height", "48px");
  await expect(page.getByRole("navigation", { name: labels.navigation, exact: true })).toHaveCSS("width", "56px");
  await page.screenshot({ path: test.info().outputPath("desktop-company-list.png"), fullPage: true });
  // Opening a client-only control proves hydration completed before counting requests.
  await page.getByRole("button", { name: labels.add, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").locator("#record-name")).toBeVisible();
  expect(requests.layouts).toEqual([]);
  await page.getByRole("dialog").getByRole("button", { name: labels.cancel, exact: true }).click();
  await settled(page);
  expect(listRequests).toHaveLength(0);

  const updated = await api.patch(`/api/crm/companies/${company.id}`, { data: { action: "update", data: { name: `${prefix}-after` } } });
  expect(updated.ok()).toBe(true);
  const refreshed = page.waitForResponse(res => new URL(res.url()).pathname === "/api/crm/companies" && res.request().method() === "GET");
  await page.evaluate(() => window.dispatchEvent(new Event("crm:invalidate")));
  expect((await refreshed).ok()).toBe(true);
  await expect(page.getByRole("link", { name: `${prefix}-after`, exact: true })).toBeVisible();
  await settled(page);
  expect(listRequests).toHaveLength(1);
  requests.foregroundPages.length = 0;

  const searched = page.waitForResponse(res => new URL(res.url()).pathname === "/api/crm/companies" && new URL(res.url()).searchParams.get("q") === `${prefix}-missing`);
  await page.getByRole("textbox", { name: labels.search, exact: true }).fill(`${prefix}-missing`);
  await query(page, "q", `${prefix}-missing`);
  expect((await searched).ok()).toBe(true);
  await settled(page);
  expect(listRequests).toHaveLength(2);
  expect(requests.foregroundPages).toEqual([]);
  expect(requests.recordPages).toEqual([]);
  await expect(page.getByRole("link", { name: `${prefix}-after`, exact: true })).toHaveCount(0);
  await page.goBack();
  await query(page, "q", prefix);
  await expect(page.getByRole("link", { name: `${prefix}-after`, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: `${prefix}-before`, exact: true })).toHaveCount(0);
  await settled(page);
  expect(listRequests).toHaveLength(3);
  await page.goForward();
  await query(page, "q", `${prefix}-missing`);
  await settled(page);
  await expect(page.getByRole("link", { name: `${prefix}-after`, exact: true })).toHaveCount(0);
  expect(listRequests).toHaveLength(4);
  expect(requests.foregroundPages).toEqual([]);
  expect(requests.recordPages).toEqual([]);
});

test("order form renders while its required creation reservation is prepared", async ({ page }) => {
  const labels = getCrmDictionary("en");
  let drafts = 0;
  await page.route("**/api/crm/record-drafts", async route => {
    drafts += 1;
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.goto("/en/crm/orders");
  await page.getByRole("button", { name: labels.add, exact: true }).click();
  const dialog = page.getByRole("dialog");
  const submit = dialog.locator('button[type="submit"]');
  await expect(dialog.locator("#record-name")).toBeVisible();
  await expect(submit).toBeDisabled();
  await expect.poll(() => drafts).toBe(1);
  await expect(submit).toBeEnabled();
});

test("record sheets and tabs preserve the list without page requests or record prefetch", async ({ page }) => {
  const labels = getCrmDictionary("en");
  const name = `sheet-navigation-${Date.now()}`;
  const company = await create("companies", { name });
  const requests = trackCompanyRequests(page);
  await page.goto(`/en/crm/companies?q=${name}&sort=name&columns=name,domain`);
  const trigger = page.getByRole("link", { name, exact: true });
  await expect(trigger).toBeVisible();
  await trigger.hover();
  requests.foregroundPages.length = 0;
  const detail = page.waitForResponse(res => new URL(res.url()).pathname === `/api/crm/companies/${company.id}`);
  await trigger.click();
  expect((await detail).ok()).toBe(true);
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name, exact: true })).toBeFocused();
  await sheet.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
  await page.screenshot({ path: test.info().outputPath("desktop-record-sheet.png"), fullPage: true });
  for (const tab of ["activities", "fields", "details"] as const) {
    const button = sheet.getByRole("navigation").getByRole("button", { name: labels[tab], exact: true });
    await button.click();
    await query(page, "tab", tab);
    await expect(button).toHaveAttribute("aria-current", "page");
  }
  await sheet.getByRole("button", { name: labels.close, exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await query(page, "recordId", null);
  await page.goBack();
  await query(page, "recordId", company.id);
  await expect(sheet.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.goBack();
  await query(page, "tab", "fields");
  await expect(sheet.getByRole("navigation").getByRole("button", { name: labels.fields, exact: true })).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await query(page, "tab", "details");
  await page.goForward();
  await expect(sheet).toHaveCount(0);
  await settled(page);
  await query(page, "q", name);
  await query(page, "columns", "name,domain");
  expect(requests.lists).toEqual([]);
  expect(requests.foregroundPages).toEqual([]);
  expect(requests.recordPages).toEqual([]);
});

test("modified record click opens a working deep link in another tab", async ({ page, context }) => {
  const name = `modified-link-${Date.now()}`;
  const company = await create("companies", { name });
  await page.goto(`/en/crm/companies?q=${name}`);
  const trigger = page.getByRole("link", { name, exact: true });
  await expect(trigger).toBeVisible();
  const originalUrl = page.url();
  const opened = context.waitForEvent("page");
  await trigger.click({ modifiers: ["ControlOrMeta"] });
  const otherPage = await opened;
  try {
    await otherPage.waitForLoadState("domcontentloaded");
    await query(otherPage, "recordId", company.id);
    await query(otherPage, "q", name);
    await expect(otherPage.getByRole("dialog").getByRole("heading", { name, exact: true })).toBeVisible();
    expect(page.url()).toBe(originalUrl);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally { await otherPage.close(); }
});

test("sidebar navigation announces pending while the destination response is held", async ({ page }) => {
  const labels = getCrmDictionary("en");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.pathname.startsWith("/en/crm/contacts"), async route => { await gate; await route.continue(); });
  try {
    await page.goto("/en/crm/companies");
    await settled(page);
    await page.getByRole("navigation", { name: labels.navigation, exact: true }).getByRole("link", { name: labels.contact, exact: true }).click();
    await expect(page.locator("[data-navigation-pending]")).toBeVisible();
    await expect(page.locator("#main-content [data-navigation-pending]")).toBeVisible();
    await expect(page.locator("header + [data-navigation-pending]")).toHaveCount(0);
    await expect(page.locator("#main-content > div[hidden][inert]")).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: labels.navigation, exact: true })).toBeVisible();
    await expect(page.locator("#main-content")).toHaveAttribute("aria-busy", "true");
    release();
    await expect(page.locator("[data-list-heading]")).toHaveText(labels.contact);
    await expect(page.locator("[data-navigation-pending]")).toHaveCount(0);
  } finally { release(); }
});

test("Back refreshes a cached company list after invalidation on another page", async ({ page }) => {
  const labels = getCrmDictionary("en");
  const prefix = `off-page-${Date.now()}`;
  const company = await create("companies", { name: `${prefix}-before` });
  await page.goto(`/en/crm/companies?q=${prefix}`);
  await expect(page.getByRole("link", { name: `${prefix}-before`, exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: labels.search, exact: true }).fill(`${prefix}-`);
  await query(page, "q", `${prefix}-`);
  await settled(page);
  await page.getByRole("navigation", { name: labels.navigation, exact: true }).getByRole("link", { name: labels.contact, exact: true }).click();
  await expect(page.locator("[data-list-heading]")).toHaveText(labels.contact);
  await settled(page);
  const updated = await api.patch(`/api/crm/companies/${company.id}`, { data: { action: "update", data: { name: `${prefix}-after` } } });
  expect(updated.ok()).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("crm:invalidate")));
  await settled(page);
  await page.goBack();
  await query(page, "q", `${prefix}-`);
  await expect(page.getByRole("link", { name: `${prefix}-after`, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: `${prefix}-before`, exact: true })).toHaveCount(0);
});

test("table headers stay pinned while the list body scrolls", async ({ page }) => {
  const prefix = `sticky-${Date.now()}`;
  for (let index = 0; index < 12; index++) await create("companies", { name: `${prefix}-${String(index).padStart(2, "0")}` });
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto(`/en/crm/companies?q=${prefix}&sort=name&dir=asc`);
  await settled(page);
  await expect(page.locator("tbody tr")).toHaveCount(12);
  const scroller = page.locator('[data-slot="table-container"]').locator("..");
  const header = page.locator("thead");
  const firstRow = page.locator("tbody tr").first();
  await expect.poll(() => scroller.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(100);
  const headerBefore = await header.boundingBox();
  const rowBefore = await firstRow.boundingBox();
  await scroller.hover();
  await page.mouse.wheel(0, 200);
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(100);
  await expect.poll(async () => Math.abs((await header.boundingBox())!.y - headerBefore!.y)).toBeLessThanOrEqual(2);
  expect(rowBefore!.y - (await firstRow.boundingBox())!.y).toBeGreaterThan(100);
  await expect(header).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("desktop-sticky-table-scroll.png"), fullPage: true });
});

for (const locale of ["vi", "en"] as const) {
  const labels = getCrmDictionary(locale);
  test(`${locale}: choosing a company survives searching other companies`, async ({ page }) => {
    const prefix = `choose-${locale}-${Date.now()}`;
    await create("companies", { name: `${prefix}-first` });
    const chosen = await create("companies", { name: `${prefix}-chosen` });
    await page.goto(`/${locale}/crm/contacts`);
    await page.getByRole("button", { name: labels.add, exact: true }).click();
    const sheet = page.getByRole("dialog");
    await sheet.locator("#record-firstName").fill(prefix);
    await sheet.locator("#record-companyId").click();
    await expect(page.getByPlaceholder(labels.chooseCompany, { exact: true })).toBeFocused();
    await page.getByPlaceholder(labels.chooseCompany, { exact: true }).fill(`${prefix}-chosen`);
    await expect(page.getByPlaceholder(labels.chooseCompany, { exact: true })).toHaveValue(`${prefix}-chosen`);
    await page.getByRole("option", { name: `${prefix}-chosen`, exact: true }).click();
    await expect(sheet.locator('input[name="companyId"]')).toHaveValue(chosen.id);
    // Wait for the completed close lifecycle before exercising a new open.
    await expect(page.getByPlaceholder(labels.chooseCompany, { exact: true })).toHaveCount(0);
    await expect(sheet.locator("#record-companyId")).toBeFocused();
    await sheet.locator("#record-companyId").click();
    await expect(page.getByPlaceholder(labels.chooseCompany, { exact: true })).toBeFocused();
    await page.getByPlaceholder(labels.chooseCompany, { exact: true }).fill(`${prefix}-first`);
    await expect(page.getByPlaceholder(labels.chooseCompany, { exact: true })).toHaveValue(`${prefix}-first`);
    await expect(page.getByRole("option", { name: `${prefix}-first`, exact: true })).toBeVisible();
    await expect(sheet.locator('input[name="companyId"]')).toHaveValue(chosen.id);
    await page.keyboard.press("Escape");
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
        await sheet.locator("#record-companyId").click();
        await expect(page.getByPlaceholder(labels.chooseCompany, { exact: true })).toBeFocused();
    await page.getByPlaceholder(labels.chooseCompany, { exact: true }).fill(`${prefix}-parent`);
    await expect(page.getByPlaceholder(labels.chooseCompany, { exact: true })).toHaveValue(`${prefix}-parent`);
        await page.getByRole("option", { name: `${prefix}-parent`, exact: true }).click();
        await expect(sheet.locator('input[name="companyId"]')).toHaveValue(parent.id);
      }
      if (entity === "deals") {
        await expect(sheet.locator("#record-ownerMembershipId")).toHaveAttribute("aria-busy", "false");
        await sheet.locator("#record-ownerMembershipId").click();
        await page.locator(`[role="option"][data-value="${ownerId}"]`).click();
        await sheet.locator("#record-amountMinor").fill("12345");
      }
      await sheet.getByRole("button", { name: labels.save, exact: true }).click();
      await expect(sheet.getByRole("heading", { name, exact: true })).toBeVisible();
      const id = new URL(page.url()).searchParams.get("recordId")!;
      await sheet.getByRole("button", { name: locale === "vi" ? "Thao tác" : "More actions", exact: true }).click();
      await page.getByRole("menuitem", { name: labels.edit, exact: true }).click();
      if (entity === "deals") await expect(sheet.locator('input[name="ownerMembershipId"]')).toHaveValue(ownerId);
      await sheet.locator(entity === "contacts" ? "#record-firstName" : "#record-name").fill(`${name}-edited`);
      await sheet.getByRole("button", { name: labels.save, exact: true }).click();
      await expect(sheet.getByRole("heading", { name: `${name}-edited`, exact: true })).toBeVisible();
      if (entity === "companies") {
        const website = `https://${prefix}.example`;
        await sheet.getByRole("button", { name: `${labels.edit}: ${labels.labels.website}`, exact: true }).press("Enter");
        const editor = sheet.getByRole("textbox", { name: labels.labels.website, exact: true });
        await editor.fill(website);
        await editor.press("Enter");
        await expect.poll(async () => (await (await api.get(`/api/crm/companies/${id}`)).json()).website).toBe(website);
        await expect(sheet.getByRole("button", { name: `${labels.edit}: ${labels.labels.website}`, exact: true })).toContainText(website);
        await sheet.getByRole("button", { name: `${labels.edit}: ${labels.labels.website}`, exact: true }).press("Enter");
        await editor.fill("https://cancelled.example");
        await editor.press("Escape");
        await expect(sheet.getByRole("heading", { name: `${name}-edited`, exact: true })).toBeVisible();
        expect((await (await api.get(`/api/crm/companies/${id}`)).json()).website).toBe(website);
      }
      for (const action of ["archive", "restore"] as const) {
        await sheet.getByRole("button", { name: locale === "vi" ? "Thao tác" : "More actions", exact: true }).click();
        await page.getByRole("menuitem", { name: labels[action], exact: true }).click();
        await page.getByRole("button", { name: labels.confirm, exact: true }).click();
        await expect(page.getByRole("dialog")).toHaveCount(1);
        await expect.poll(async () => (await (await api.get(`/api/crm/${entity}/${id}`)).json()).archivedAt !== null).toBe(action === "archive");
        await sheet.getByRole("button", { name: locale === "vi" ? "Thao tác" : "More actions", exact: true }).click();
        await expect(page.getByRole("menuitem", { name: labels[action === "archive" ? "restore" : "archive"], exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
      }
      await sheet.getByRole("button", { name: labels.close, exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await settled(page);
      await expect(page.getByRole("link", { name: `${name}-edited`, exact: true })).toBeVisible();
      if (entity === "deals") {
        const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: `${name}-edited`, exact: true }) });
        await row.getByRole("button", { name: `${labels.labels.stageId}: ${labels.stages["demo-booked"]}`, exact: true }).press("Enter");
        const changed = page.waitForResponse(response => new URL(response.url()).pathname === `/api/crm/deals/${id}` && response.request().method() === "PATCH");
        await page.getByRole("menuitemradio", { name: labels.stages["closed-won"], exact: true }).focus();
        await page.keyboard.press("Enter");
        expect((await changed).ok()).toBe(true);
        await settled(page);
        await expect(row.getByRole("button", { name: `${labels.labels.stageId}: ${labels.stages["closed-won"]}`, exact: true })).toBeVisible();
        expect((await (await api.get(`/api/crm/deals/${id}`)).json()).stageId).toBe("closed-won");
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
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
    await page.getByRole("button", { name: labels.archived, exact: true }).click();
    await query(page, "page", null);
    await settled(page);
    await page.getByRole("checkbox", { name: `${labels.select} ${prefix}-4`, exact: true }).check();
    await page.getByRole("button", { name: labels.restore, exact: true }).click();
    await page.getByRole("button", { name: labels.confirm, exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(async () => (await (await api.get(`/api/crm/companies/${ids[4]}`)).json()).archivedAt).toBeNull();
    await page.goto(`/${locale}/crm/companies?q=${prefix}&pageSize=2&page=2`);
    await page.getByRole("textbox", { name: labels.search, exact: true }).fill(`${prefix}-0`);
      await query(page, "page", null);
    await query(page, "q", `${prefix}-0`);
    await settled(page);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.goto(`/${locale}/crm/companies?q=${prefix}&pageSize=2&page=2`);
    await page.getByRole("button", { name: labels.sort, exact: true }).click();
    await page.getByRole("menuitemradio", { name: labels.labels.name, exact: true }).click();
    await query(page, "page", null);
    await query(page, "sort", "name");
    await page.getByRole("button", { name: new RegExp(labels.columns) }).click();
    const domainColumn = page.getByRole("option", { name: labels.labels.domain, exact: true });
    const domainCheck = domainColumn.locator('[role="checkbox"]');
    await expect(domainCheck).toBeChecked();
    await domainColumn.click();
    await query(page, "columns", "name,industry,owner,createdAt");
    await expect(domainCheck).not.toBeChecked();
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="dropdown-menu-content"]')).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: labels.labels.domain, exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("columnheader", { name: labels.labels.domain, exact: true })).toHaveCount(0);
    await page.goto(`/${locale}/crm/companies?q=${prefix}&pageSize=2&page=2`);
    await settled(page);
    await page.getByRole("button", { name: labels.filters, exact: true }).click();
    await page.getByRole("menuitem", { name: labels.labels.industry, exact: true }).hover();
    const industryFilter = page.getByRole("option", { name: new RegExp(`${prefix}-industry`) });
    await industryFilter.click();
    await query(page, "page", null);
    await query(page, "industry", `${prefix}-industry`);
    await expect(industryFilter.locator('[role="checkbox"]')).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="dropdown-menu-sub-content"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="dropdown-menu-content"]')).toHaveCount(0);
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
    await page.screenshot({ path: test.info().outputPath(`${locale}-mobile-list.png`), fullPage: true });
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
    // History can restore content before the sheet entrance animation finishes.
    await sheet.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
    const box = await sheet.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    await page.screenshot({ path: test.info().outputPath(`${locale}-mobile-sheet.png`), fullPage: true });
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
    await page.goto(`/${locale}/crm/companies?recordType=company&recordId=${company.id}&tab=unknown`);
    await expect(page.getByRole("heading", { name: labels.invalidQuery, exact: true })).toBeVisible();
    await expect(sheet).toHaveCount(0);
  });
}
