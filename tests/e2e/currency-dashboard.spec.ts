import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { formatMinor } from "../../src/currency/currency-catalog";
import type { CurrencySettings } from "../../src/currency/currency-contracts";
import type { DashboardSummaryData } from "../../src/dashboard/dashboard-contracts";
import { getCurrencyDictionary } from "../../src/i18n/currency-dictionary";
import { getCrmDictionary } from "../../src/i18n/crm-dictionary";

test.use({ actionTimeout: 10_000 });
test.describe.configure({ mode: "serial" });
let api: APIRequestContext;
let member: APIRequestContext;
let companyId: string;
let mainDealId: string;
let ownerId: string;
const mainDealName = "Currency dashboard major opportunity";
async function settings(): Promise<CurrencySettings> { const response = await api.get("/api/crm/currency"); expect(response.ok(), await response.text()).toBe(true); return response.json(); }
async function change(data: object): Promise<CurrencySettings> { const response = await api.patch("/api/crm/currency", { data }); expect(response.ok(), await response.text()).toBe(true); return response.json(); }
async function finish() { for (let iteration = 0; iteration < 20; iteration++) { const current = await settings(); if (!current.job) return; await change({ action: "resume", jobId: current.job.id }); } throw new Error("Conversion did not finish within bounded fixture budget"); }
async function create(path: string, data: object) { const response = await api.post(`/api/crm/${path}`, { data }); expect(response.ok(), await response.text()).toBe(true); return response.json(); }
test.beforeAll(async ({ baseURL }) => {
  async function signIn(role: "OWNER" | "MEMBER") { const client = await request.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { origin: baseURL! } }); expect((await client.post("/api/auth/sign-in/email", { data: { email: process.env[`E2E_${role}_EMAIL`], password: process.env[`E2E_${role}_PASSWORD`] } })).ok()).toBe(true); return client; }
  api = await signIn("OWNER"); member = await signIn("MEMBER");
  const { rows } = await (await api.get("/api/crm/owners")).json();
  ownerId = rows.find((row: { email: string }) => row.email === process.env["E2E_OWNER_EMAIL"]).membershipId;
  const memberId = rows.find((row: { email: string }) => row.email === process.env["E2E_MEMBER_EMAIL"]).membershipId;
  companyId = (await create("companies", { name: "Currency dashboard company", ownerMembershipId: ownerId })).id;
  mainDealId = (await create("deals", { name: mainDealName, companyId, ownerMembershipId: ownerId, amountMinor: 90_000_000_000_001, currency: "USD" })).id;
  await create("deals", { name: "Member opportunity", companyId, ownerMembershipId: memberId, amountMinor: 8000, currency: "USD" });
  await create("deals", { name: "Missing CHF opportunity", companyId, ownerMembershipId: ownerId, amountMinor: 2000, currency: "CHF" });
  for (let index = 0; index < 28; index++) await create("deals", { name: `Bounded conversion opportunity ${index}`, companyId, ownerMembershipId: ownerId, amountMinor: 1, currency: "USD" });
  await create("activities", { type: "task", subject: "Currency overdue follow-up", dealId: mainDealId, dueAt: "2020-01-02T12:00:00.000Z", occurredAt: "2020-01-01T12:00:00.000Z" });
});
test.beforeEach(async ({ context }) => { await finish(); if ((await settings()).reportingCurrency !== "USD") { await change({ action: "set_reporting_currency", currency: "USD" }); await finish(); } await context.addCookies((await api.storageState()).cookies); });
test.afterAll(async () => { await api?.dispose(); await member?.dispose(); });

for (const locale of ["vi", "en"] as const) {
  const labels = getCurrencyDictionary(locale); const crm = getCrmDictionary(locale);
  test(`${locale}: dashboard scope exact money exclusions stable links and mobile`, async ({ page }) => {
    await page.goto(`/${locale}/crm`);
    await expect(page.getByRole("heading", { name: labels.dashboard, exact: true })).toBeVisible();
    await expect(page.locator("[aria-busy]").first()).toHaveAttribute("aria-busy", "false");
    const mine: DashboardSummaryData = await (await api.get("/api/crm/dashboard?scope=me")).json();
    const pipeline = page.locator("section").filter({ has: page.getByRole("heading", { name: labels.pipeline, exact: true }) }).first();
    await expect(pipeline).toContainText(formatMinor(mine.pipeline.totalMinor, "USD", locale));
    await expect(page.getByText(labels.excluded, { exact: false })).toContainText("CHF");
    await expect(page.getByText("Currency overdue follow-up", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(6);
    await page.getByLabel(labels.scope, { exact: true }).selectOption("everyone");
    await expect.poll(() => new URL(page.url()).searchParams.get("scope")).toBe("everyone");
    const everyone: DashboardSummaryData = await (await api.get("/api/crm/dashboard?scope=everyone")).json();
    expect(BigInt(everyone.pipeline.totalMinor) - BigInt(mine.pipeline.totalMinor)).toBe(8000n);
    await expect(pipeline).toContainText(formatMinor(everyone.pipeline.totalMinor, "USD", locale));
    await page.getByRole("link", { name: mainDealName, exact: true }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("scope")).toBe("everyone");
    await expect(page.getByRole("dialog")).toContainText(formatMinor("90000000000001", "USD", locale));
    await page.reload(); await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("heading", { name: labels.dashboard, exact: true })).toBeVisible();
  });

  test(`${locale}: manual rates bounded resume cancel and reporting change`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`/${locale}/crm/settings/currencies`);
    await page.getByLabel(labels.base, { exact: true }).selectOption("EUR");
    await expect(page.locator("[aria-busy]")).toHaveAttribute("aria-busy", "false");
    await page.getByLabel(labels.currency, { exact: true }).selectOption("USD");
    await page.getByLabel(labels.rate, { exact: true }).fill("0.9");
    await page.getByRole("button", { name: labels.addRate, exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: labels.saved })).toBeVisible();
    await expect(page.getByRole("table")).toContainText("0.9");
    const pending = await change({ action: "set_reporting_currency", currency: "EUR" });
    expect(pending.job?.processed).toBe(0);
    const first = await change({ action: "resume", jobId: pending.job!.id });
    expect(first.job?.processed).toBe(25); expect(first.reportingCurrency).toBe("USD");
    await page.reload();
    await expect(page.getByRole("button", { name: labels.resume, exact: true })).toBeVisible();
    await expect(page.getByText(labels.blocked, { exact: true })).toBeVisible();
    expect((await api.post("/api/crm/deals", { data: { name: "Blocked money write", companyId, ownerMembershipId: ownerId } })).status()).toBe(409);
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: labels.cancelJob, exact: true }).click();
    await expect(page.getByRole("button", { name: labels.cancelJob, exact: true })).toHaveCount(0);
    expect((await settings()).reportingCurrency).toBe("USD");
    await page.getByLabel(labels.reporting, { exact: true }).selectOption("EUR");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: labels.change, exact: true }).click();
    await expect(page.getByRole("heading", { name: `${labels.current}: EUR`, exact: true })).toBeVisible();
    expect((await settings()).job).toBeNull();
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`${locale}: member can read currency settings but cannot change rates`, async ({ context, page }) => {
    await context.clearCookies(); await context.addCookies((await member.storageState()).cookies);
    await page.goto(`/${locale}/crm/settings/currencies`);
    await expect(page.getByText(labels.ownerOnly, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: labels.addRate, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: labels.change, exact: true })).toHaveCount(0);
    expect((await member.patch("/api/crm/currency", { data: { action: "set_manual_rate", baseCurrency: "USD", currency: "CHF", rate: "2" } })).status()).toBe(403);
    await page.goto(`/${locale}/crm?scope=everyone`);
    await expect(page.getByRole("heading", { name: labels.dashboard, exact: true })).toBeVisible();
    await page.getByRole("link", { name: mainDealName, exact: true }).first().click();
    await expect(page.getByRole("dialog").getByRole("button", { name: crm.edit, exact: true })).toBeVisible();
  });
}
