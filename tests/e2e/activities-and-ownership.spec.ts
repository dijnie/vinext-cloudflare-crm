import { expect, request, test, type APIRequestContext, type Page, type Locator } from "@playwright/test";
import { getCrmDictionary } from "../../src/lib/i18n/crm-dictionary";

test.use({ actionTimeout: 10_000 });
let api: APIRequestContext;
let ownerId: string;
let memberId: string;
let disposableId: string;
async function pick(page: Page, trigger: Locator, value: string) { await trigger.click(); await page.locator(`[role="option"][data-value="${value}"]`).click(); }
async function editRecord(page: Page, locale: string, labels: ReturnType<typeof getCrmDictionary>) { await page.getByRole("button", { name: locale === "vi" ? "Thao tác" : "More actions", exact: true }).click(); await page.getByRole("menuitem", { name: labels.edit, exact: true }).click(); }
test.beforeAll(async ({ baseURL }) => {
  api = await request.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { origin: baseURL! } });
  expect((await api.post("/api/auth/sign-in/email", { data: { email: process.env["E2E_OWNER_EMAIL"], password: process.env["E2E_OWNER_PASSWORD"] } })).ok()).toBe(true);
  const { rows } = await (await api.get("/api/crm/owners")).json();
  ownerId = rows.find((row: { email: string }) => row.email === process.env["E2E_OWNER_EMAIL"]).membershipId;
  memberId = rows.find((row: { email: string }) => row.email === process.env["E2E_MEMBER_EMAIL"]).membershipId;
  disposableId = rows.find((row: { email: string }) => row.email === process.env["E2E_DISPOSABLE_MEMBER_EMAIL"]).membershipId;
});
test.beforeEach(async ({ context }) => { await context.addCookies((await api.storageState()).cookies); });
test.afterAll(async () => { await api?.dispose(); });
async function create(path: string, data: object): Promise<{ id: string }> {
  const response = await api.post(`/api/crm/${path}`, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function fixture(prefix: string) {
  const company = await create("companies", { name: prefix, ownerMembershipId: ownerId });
  const contact = await create("contacts", { firstName: `${prefix}-contact`, companyId: company.id, ownerMembershipId: ownerId });
  const deal = await create("deals", { name: `${prefix}-deal`, companyId: company.id, ownerMembershipId: ownerId });
  return { company, contact, deal };
}
const paths = { company: "companies", contact: "contacts", deal: "deals" } as const;
type Entity = keyof typeof paths;
async function open(page: Page, locale: string, entity: Entity, id: string, tab = "activities") {
  await page.goto(`/${locale}/crm/${paths[entity]}?recordType=${entity}&recordId=${id}&tab=${tab}`);
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function timeline(entity: Entity, id: string) {
  const response = await api.get(`/api/crm/activities?entity=${entity}&recordId=${id}`);
  expect(response.ok()).toBe(true);
  return (await response.json()).entries as Array<{ id: string; type: string; subject: string | null; companyId: string | null; completedAt: string | null; dueAt: string | null }>;
}

for (const locale of ["vi", "en"] as const) {
  const labels = getCrmDictionary(locale);
  const copy = labels.activity;
  test(`${locale}: manual activity types tasks filters and inferred company timeline`, async ({ page }) => {
    test.setTimeout(90_000);
    const prefix = `activity-${locale}-${Date.now()}`;
    const records = await fixture(prefix);
    for (const entity of ["company", "contact", "deal"] as const) {
      await open(page, locale, entity, records[entity].id);
      const sheet = page.getByRole("dialog");
      for (const type of ["note", "call", "meeting", "task"] as const) {
        const subject = `${prefix}-${entity}-${type}`;
        await sheet.getByRole("group", { name: copy.type, exact: true }).getByRole("button", { name: copy.types[type], exact: true }).click();
        if (await sheet.locator("details").getAttribute("open") === null) await sheet.locator("summary").click();
        if (type === "task") {
          await sheet.getByRole("button", { name: labels.save, exact: true }).click();
          await expect(sheet.locator("#activity-subject")).toBeFocused();
          expect(await sheet.locator("#activity-subject").evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
          await sheet.locator("#activity-subject").fill("   ");
          await sheet.getByRole("button", { name: labels.save, exact: true }).click();
          await expect(sheet.locator("#activity-subject")).toHaveAttribute("aria-invalid", "true");
          await expect(sheet.getByRole("alert")).toContainText(labels.invalid);
          await sheet.locator("#activity-dueAt").fill("2030-01-02T10:00");
        }
        await sheet.locator("#activity-subject").fill(subject);
        await sheet.locator("#activity-content").fill(`Body ${subject}`);
        await sheet.locator("#activity-occurredAt").fill("2026-09-04T09:00");
        await sheet.getByRole("button", { name: labels.save, exact: true }).click();
        await expect(sheet.getByRole("heading", { name: subject, exact: true })).toBeVisible();
        await expect(sheet.getByText(`Body ${subject}`, { exact: true })).toBeVisible();
      }
      const taskName = `${prefix}-${entity}-task`;
      await pick(page, sheet.getByLabel(copy.filter, { exact: true }), "upcoming");
      const taskRow = sheet.locator("li").filter({ has: page.getByRole("heading", { name: taskName, exact: true }) });
      await expect(taskRow).toBeVisible();
      await expect(sheet.locator("ol > li")).toHaveCount(1);
      await expect(taskRow.locator("time[datetime='2030-01-02T10:00:00.000Z']")).toBeVisible();
      await taskRow.getByRole("button", { name: copy.complete, exact: true }).click();
      await expect(taskRow).toHaveCount(0);
      await pick(page, sheet.getByLabel(copy.filter, { exact: true }), "done");
      await expect(taskRow.getByRole("button", { name: copy.reopen, exact: true })).toBeVisible();
      const completed = (await timeline(entity, records[entity].id)).find(entry => entry.subject === taskName)!;
      expect(completed.completedAt).not.toBeNull();
      expect(completed.dueAt).toBe("2030-01-02T10:00:00.000Z");
      await taskRow.getByRole("button", { name: copy.reopen, exact: true }).click();
      await expect(taskRow).toHaveCount(0);
      await pick(page, sheet.getByLabel(copy.filter, { exact: true }), "history");
      await expect(sheet.locator("ol > li")).toHaveCount(3);
      await expect(sheet.getByRole("heading", { name: taskName, exact: true })).toHaveCount(0);
      for (const [filter, type] of [["notes", "note"], ["calls", "call"], ["meetings", "meeting"]]) {
        await pick(page, sheet.getByLabel(copy.filter, { exact: true }), filter!);
        await expect(sheet.locator("ol > li")).toHaveCount(1);
        await expect(sheet.getByRole("heading", { name: `${prefix}-${entity}-${type}`, exact: true })).toBeVisible();
      }
    }
    const companyEntries = await timeline("company", records.company.id);
    expect(companyEntries).toHaveLength(12);
    expect(companyEntries.every(entry => entry.companyId === records.company.id)).toBe(true);
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, locale, "company", records.company.id);
    await expect(page.getByRole("dialog").locator("ol > li")).toHaveCount(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await expect(page.getByRole("dialog").getByRole("heading", { name: `${prefix}-deal-call`, exact: true })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: labels.details, exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("tab")).toBe("details");
    await expect(page.getByRole("dialog").getByRole("group", { name: copy.type, exact: true })).toHaveCount(0);
    await page.goBack();
    await expect(page.getByRole("dialog").locator("ol > li")).toHaveCount(12);
    await page.goForward();
    await expect(page.getByRole("dialog").getByRole("group", { name: copy.type, exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-list-heading]")).toBeFocused();
  });

  test(`${locale}: stage edits produce localized immutable audit without no-op duplicates`, async ({ page }) => {
    const records = await fixture(`stage-${locale}-${Date.now()}`);
    await open(page, locale, "deal", records.deal.id, "details");
    const sheet = page.getByRole("dialog");
    for (const field of ["owner", "stage"] as const) {
      const edit = sheet.getByRole("button", { name: `${labels.edit}: ${labels.labels[field]}`, exact: true });
      await edit.click();
      const trigger = sheet.locator(`#inline-${field}-${records.deal.id}`);
      await trigger.focus();
      await trigger.press("Escape");
      await expect(edit).toBeVisible();
      await expect(sheet).toBeVisible();
    }
    await editRecord(page, locale, labels);
    await pick(page, sheet.locator("#record-stageId"), "qualified-to-buy");
    await sheet.getByRole("button", { name: labels.save, exact: true }).click();
    await sheet.getByRole("button", { name: labels.activities, exact: true }).click();
    await expect(sheet.locator("ol > li")).toHaveCount(1);
    await expect(sheet.getByText(`${copy.stageChange}: ${labels.stages["demo-booked"]} → ${labels.stages["qualified-to-buy"]}`, { exact: true })).toBeVisible();
    const entries = await timeline("deal", records.deal.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.type).toBe("stage_change");
    expect((await api.patch(`/api/crm/activities/${entries[0]!.id}`, { data: { completed: true } })).status()).toBe(400);
    await editRecord(page, locale, labels);
    await expect(sheet.locator("#record-stageId")).toContainText(labels.stages["qualified-to-buy"]);
    await sheet.getByRole("button", { name: labels.save, exact: true }).click();
    await expect(sheet.locator("ol > li")).toHaveCount(1);
    expect(await timeline("deal", records.deal.id)).toHaveLength(1);
    expect(await timeline("company", records.company.id)).toHaveLength(1);
  });

  test(`${locale}: single and selected bulk ownership nullable policy`, async ({ page }) => {
    test.setTimeout(90_000);
    const prefix = `owner-${locale}-${Date.now()}`;
    const first = await fixture(`${prefix}-first`);
    const other = await fixture(`${prefix}-other`);
    for (const entity of ["company", "contact", "deal"] as const) {
      await open(page, locale, entity, first[entity].id, "details");
      const sheet = page.getByRole("dialog");
      await editRecord(page, locale, labels);
      await expect(sheet.locator("#record-ownerMembershipId")).toHaveAttribute("aria-busy", "false");
      await pick(page, sheet.locator("#record-ownerMembershipId"), memberId);
      await sheet.getByRole("button", { name: labels.save, exact: true }).click();
      await expect.poll(async () => (await (await api.get(`/api/crm/${paths[entity]}/${first[entity].id}`)).json()).ownerMembershipId).toBe(memberId);
      await sheet.getByRole("button", { name: labels.close, exact: true }).click();
      await page.goto(`/${locale}/crm/${paths[entity]}?q=${prefix}`);
      await expect(page.locator("section[aria-busy]")).toHaveAttribute("aria-busy", "false");
      const name = `${prefix}-first${entity === "company" ? "" : `-${entity}`}`;
      await page.getByRole("checkbox", { name: `${labels.select} ${name}`, exact: true }).check();
      await page.getByRole("button", { name: copy.reassign, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator("#bulk-owner")).toHaveAttribute("aria-busy", "false");
      if (entity === "deal") {
        await dialog.getByRole("button", { name: labels.confirm, exact: true }).click();
        await expect(dialog.locator("#bulk-owner")).toBeFocused();
        expect(await dialog.locator("#bulk-owner").evaluate(trigger => trigger.parentElement?.querySelector("select")?.validity.valueMissing)).toBe(true);
        await pick(page, dialog.locator("#bulk-owner"), ownerId);
      }
      const mutation = page.waitForRequest(req => req.method() === "PATCH" && new URL(req.url()).pathname === "/api/crm/ownership");
      await dialog.getByRole("button", { name: labels.confirm, exact: true }).click();
      expect((await mutation).postDataJSON()).toEqual({ entity, ids: [first[entity].id], ownerMembershipId: entity === "deal" ? ownerId : null });
      await expect(dialog).toHaveCount(0);
      expect((await (await api.get(`/api/crm/${paths[entity]}/${first[entity].id}`)).json()).ownerMembershipId).toBe(entity === "deal" ? ownerId : null);
      expect((await (await api.get(`/api/crm/${paths[entity]}/${other[entity].id}`)).json()).ownerMembershipId).toBe(ownerId);
      await expect(page.getByRole("button", { name: copy.reassign, exact: true })).toHaveCount(0);
    }
  });
}

test("revoked owner races show localized errors and fresh pickers exclude inactive members", async ({ context }) => {
  const cases = [];
  try {
    for (const locale of ["vi", "en"] as const) {
      const page = await context.newPage();
      const labels = getCrmDictionary(locale);
      const name = `revoked-${locale}-${Date.now()}`;
      const company = await create("companies", { name, ownerMembershipId: ownerId });
      cases.push({ page, labels, locale, company });
      await page.goto(`/${locale}/crm/companies?q=${name}`);
      await expect(page.locator("section[aria-busy]")).toHaveAttribute("aria-busy", "false");
      const recordSelection = page.getByRole("checkbox", { name: `${labels.select} ${name}`, exact: true });
      await recordSelection.click();
      await expect(recordSelection).toBeChecked();
      await page.getByRole("button", { name: labels.activity.reassign, exact: true }).click();
      await expect(page.locator("#bulk-owner")).toHaveAttribute("aria-busy", "false");
      await pick(page, page.locator("#bulk-owner"), disposableId);
    }
    const revoke = await api.delete(`/api/crm/members/${disposableId}`, { data: { replacementMembershipId: ownerId } });
    expect(revoke.ok(), await revoke.text()).toBe(true);
    for (const { page, labels, locale, company } of cases) {
      await page.getByRole("button", { name: labels.confirm, exact: true }).click();
      await expect(page.getByRole("alert")).toContainText(labels.invalid);
      await page.getByRole("button", { name: labels.cancel, exact: true }).click();
      await open(page, locale, "company", company.id, "details");
      await editRecord(page, locale, labels);
      await expect(page.locator("#record-ownerMembershipId")).toHaveAttribute("aria-busy", "false");
      await page.locator("#record-ownerMembershipId").click();
      await expect(page.locator(`[role="option"][data-value="${disposableId}"]`)).toHaveCount(0);
      await expect(page.locator(`[role="option"][data-value="${ownerId}"]`)).toHaveCount(1);
      await page.keyboard.press("Escape");
      expect((await (await api.get(`/api/crm/companies/${company.id}`)).json()).ownerMembershipId).toBe(ownerId);
    }
  } finally { for (const { page } of cases) await page.close(); }
});

test("related sheet back reconciles browser history and keeps forward records and list state", async ({ page }) => {
  const labels = getCrmDictionary("en");
  const prefix = `record-history-${Date.now()}`;
  const { company, contact, deal } = await fixture(prefix);
  await create(`deals/${deal.id}/contacts`, { contactId: contact.id });
  await page.goto(`/en/crm/companies?q=${prefix}&sort=name&dir=asc`);
  await page.locator(`tbody [data-record-link="${company.id}"]`).click();
  const sheet = page.getByRole("dialog");
  const recordIs = async (id: string) => {
    await expect.poll(() => new URL(page.url()).searchParams.get("recordId")).toBe(id);
    await expect(sheet.getByRole("heading", { name: id === company.id ? prefix : id === deal.id ? `${prefix}-deal` : `${prefix}-contact`, exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("q")).toBe(prefix);
    expect(new URL(page.url()).searchParams.get("sort")).toBe("name");
    expect(new URL(page.url()).searchParams.get("dir")).toBe("asc");
  };
  await sheet.locator(`[data-record-link="${deal.id}"]`).click();
  await recordIs(deal.id);
  await page.goBack();
  await recordIs(company.id);
  await expect(sheet.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
  await page.goForward();
  await recordIs(deal.id);
  await sheet.locator(`[data-record-link="${contact.id}"]`).click();
  await recordIs(contact.id);
  await page.goBack();
  await recordIs(deal.id);
  await sheet.getByRole("button", { name: "Back", exact: true }).click();
  await recordIs(company.id);
  await expect(sheet.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
  await page.goForward();
  await recordIs(deal.id);
  await page.goForward();
  await recordIs(contact.id);
  await sheet.getByRole("navigation").getByRole("button", { name: labels.activities, exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("tab")).toBe("activities");
  await sheet.getByRole("button", { name: "Back", exact: true }).click();
  await recordIs(deal.id);
  await page.goForward();
  await recordIs(contact.id);
  await page.goForward();
  await expect.poll(() => new URL(page.url()).searchParams.get("tab")).toBe("activities");
  await sheet.getByRole("button", { name: labels.close, exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("q")).toBe(prefix);
  expect(new URL(page.url()).searchParams.get("recordId")).toBeNull();
});

test("activity shortcut respects required fields and ignores a repeated submission while pending", async ({ page }) => {
  const labels = getCrmDictionary("en");
  const prefix = `shortcut-${Date.now()}`;
  const company = await create("companies", { name: prefix });
  await open(page, "en", "company", company.id);
  const sheet = page.getByRole("dialog");
  const form = sheet.locator("form");
  let posts = 0;
  let release!: () => void;
  const responseGate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/crm/activities", async route => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    const response = await route.fetch();
    await responseGate;
    await route.fulfill({ response });
  });
  try {
    await form.getByRole("button", { name: labels.activity.types.task, exact: true }).click();
    await form.locator("#activity-subject").press("Control+Enter");
    await expect(form.locator("#activity-subject")).toBeFocused();
    expect(await form.locator("#activity-subject").evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
    expect(posts).toBe(0);
    await form.getByRole("button", { name: labels.activity.types.note, exact: true }).click();
    await form.locator("#activity-content").fill(prefix);
    await form.locator("#activity-content").press("Control+Enter");
    await expect.poll(() => posts).toBe(1);
    await expect(form.locator("#activity-content")).toBeDisabled();
    await form.locator("summary").press("Control+Enter");
    await form.locator("summary").press("Meta+Enter");
    release();
    await expect(sheet.locator("ol").getByText(prefix, { exact: true })).toBeVisible();
    await expect(form.locator("#activity-content")).toBeEnabled();
    expect(posts).toBe(1);
    expect(await timeline("company", company.id)).toHaveLength(1);
  } finally { release(); await page.unroute("**/api/crm/activities"); }
});
