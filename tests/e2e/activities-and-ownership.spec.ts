import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import { getCrmDictionary } from "../../src/i18n/crm-dictionary";

test.use({ actionTimeout: 10_000 });
let api: APIRequestContext;
let ownerId: string;
let memberId: string;
let disposableId: string;
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
        await sheet.getByLabel(copy.type, { exact: true }).selectOption(type);
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
      await sheet.getByLabel(copy.filter, { exact: true }).selectOption("upcoming");
      const taskRow = sheet.locator("li").filter({ has: page.getByRole("heading", { name: taskName, exact: true }) });
      await expect(taskRow).toBeVisible();
      await expect(sheet.locator("ol > li")).toHaveCount(1);
      await expect(taskRow.locator("time[datetime='2030-01-02T10:00:00.000Z']")).toBeVisible();
      await taskRow.getByRole("button", { name: copy.complete, exact: true }).click();
      await expect(taskRow).toHaveCount(0);
      await sheet.getByLabel(copy.filter, { exact: true }).selectOption("done");
      await expect(taskRow.getByRole("button", { name: copy.reopen, exact: true })).toBeVisible();
      const completed = (await timeline(entity, records[entity].id)).find(entry => entry.subject === taskName)!;
      expect(completed.completedAt).not.toBeNull();
      expect(completed.dueAt).toBe("2030-01-02T10:00:00.000Z");
      await taskRow.getByRole("button", { name: copy.reopen, exact: true }).click();
      await expect(taskRow).toHaveCount(0);
      await sheet.getByLabel(copy.filter, { exact: true }).selectOption("history");
      await expect(sheet.locator("ol > li")).toHaveCount(3);
      await expect(sheet.getByRole("heading", { name: taskName, exact: true })).toHaveCount(0);
      for (const [filter, type] of [["notes", "note"], ["calls", "call"], ["meetings", "meeting"]]) {
        await sheet.getByLabel(copy.filter, { exact: true }).selectOption(filter!);
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
    await expect(page.getByRole("dialog").locator("#activity-type")).toHaveCount(0);
    await page.goBack();
    await expect(page.getByRole("dialog").locator("ol > li")).toHaveCount(12);
    await page.goForward();
    await expect(page.getByRole("dialog").locator("#activity-type")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-list-heading]")).toBeFocused();
  });

  test(`${locale}: stage edits produce localized immutable audit without no-op duplicates`, async ({ page }) => {
    const records = await fixture(`stage-${locale}-${Date.now()}`);
    await open(page, locale, "deal", records.deal.id, "details");
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: labels.edit, exact: true }).click();
    await sheet.locator("#record-stageId").selectOption("qualified-to-buy");
    await sheet.getByRole("button", { name: labels.save, exact: true }).click();
    await sheet.getByRole("button", { name: labels.activities, exact: true }).click();
    await expect(sheet.locator("ol > li")).toHaveCount(1);
    await expect(sheet.getByText(`${copy.stageChange}: ${labels.stages["demo-booked"]} → ${labels.stages["qualified-to-buy"]}`, { exact: true })).toBeVisible();
    const entries = await timeline("deal", records.deal.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.type).toBe("stage_change");
    expect((await api.patch(`/api/crm/activities/${entries[0]!.id}`, { data: { completed: true } })).status()).toBe(400);
    await sheet.getByRole("button", { name: labels.edit, exact: true }).click();
    await expect(sheet.locator("#record-stageId")).toHaveValue("qualified-to-buy");
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
      await sheet.getByRole("button", { name: labels.edit, exact: true }).click();
      await expect(sheet.locator("#record-ownerMembershipId")).toHaveAttribute("aria-busy", "false");
      await sheet.locator("#record-ownerMembershipId").selectOption(memberId);
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
        expect(await dialog.locator("#bulk-owner").evaluate(select => select instanceof HTMLSelectElement && select.validity.valueMissing)).toBe(true);
        await dialog.locator("#bulk-owner").selectOption(ownerId);
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
      await page.locator("#bulk-owner").selectOption(disposableId);
    }
    const revoke = await api.delete(`/api/crm/members/${disposableId}`, { data: { replacementMembershipId: ownerId } });
    expect(revoke.ok(), await revoke.text()).toBe(true);
    for (const { page, labels, locale, company } of cases) {
      await page.getByRole("button", { name: labels.confirm, exact: true }).click();
      await expect(page.getByRole("alert")).toContainText(labels.invalid);
      await page.getByRole("button", { name: labels.cancel, exact: true }).click();
      await open(page, locale, "company", company.id, "details");
      await page.getByRole("button", { name: labels.edit, exact: true }).click();
      await expect(page.locator("#record-ownerMembershipId")).toHaveAttribute("aria-busy", "false");
      await expect(page.locator(`#record-ownerMembershipId option[value="${disposableId}"]`)).toHaveCount(0);
      await expect(page.locator(`#record-ownerMembershipId option[value="${ownerId}"]`)).toHaveCount(1);
      expect((await (await api.get(`/api/crm/companies/${company.id}`)).json()).ownerMembershipId).toBe(ownerId);
    }
  } finally { for (const { page } of cases) await page.close(); }
});
