import { expect, test, type APIResponse } from "@playwright/test";
import { getReportDictionary } from "../../src/lib/i18n/report-dictionary";
import { formatMinor } from "../../src/lib/services/currencies/currency-catalog";

test.setTimeout(120_000);
async function checked(response: Pick<APIResponse, "ok" | "text" | "json">) { expect(response.ok(), await response.text()).toBe(true); return response.json(); }

test("Vietnamese report reconciles filters, personal scope and Excel permissions", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! }, labels = getReportDictionary("vi"), name = `Báo cáo ${Date.now()}`;
  await checked(await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process["env"]["E2E_OWNER_EMAIL"], password: process["env"]["E2E_OWNER_PASSWORD"] } }));
  const owners = await checked(await page.request.get("/api/crm/owners"));
  const ownerId = owners.rows.find((row: { email: string }) => row.email === process["env"]["E2E_OWNER_EMAIL"]).membershipId;
  const contact = await checked(await page.request.post("/api/crm/contacts", { headers, data: { firstName: name, birthDate: "1996-09-06", gender: "female" } }));
  const product = await checked(await page.request.post("/api/crm/products", { headers, data: { name, kind: "product", initialVariant: { label: "Chuẩn", priceMinor: 120000, costMinor: 70000, currency: "USD" } } })), detail = await checked(await page.request.get(`/api/crm/products/${product.id}`)), variant = detail.variants[0];
  const draft = await checked(await page.request.post("/api/crm/record-drafts", { headers, data: { entity: "order" } }));
  const order = await checked(await page.request.post("/api/crm/orders", { headers, data: { draftId: draft.id, name, contactId: contact.id, ownerMembershipId: ownerId, currency: "USD", source: "webform", lines: [{ variantId: variant.id, expectedVariantRevision: variant.revision, expectedProductRevision: detail.revision, quantity: 1 }] } })), settings = await checked(await page.request.get("/api/crm/settings"));
  let revision = order.revision;
  for (const action of ["confirm", "complete"] as const) revision = (await checked(await page.request.post(`/api/crm/orders/${order.id}/commands`, { headers, data: { action, expectedRevision: revision, calendarRevision: settings.revision, operationKey: crypto.randomUUID() } }))).revision;
  const orderLink = () => page.locator(`[data-record-link="${order.id}"]`);
  await page.goto("/vi/crm/reports"); await expect(page.getByRole("heading", { name: labels.title, exact: true })).toBeVisible(); await expect(orderLink()).toBeVisible();
  await expect(page.getByRole("combobox", { name: labels.specificScope, exact: true })).toBeVisible();
  await expect(page.getByText(formatMinor("120000", "USD", "vi"), { exact: true }).first()).toBeVisible(); await expect(page.getByText(formatMinor("50000", "USD", "vi"), { exact: true }).first()).toBeVisible();
  await page.getByRole("combobox", { name: labels.source, exact: true }).evaluate((element) => { const select = element as unknown as HTMLSelectElement; select.value = "webform"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await expect.poll(() => new URL(page.url()).searchParams.get("source")).toBe("webform"); await expect(orderLink()).toBeVisible();
  await page.getByRole("combobox", { name: labels.source, exact: true }).evaluate((element) => { const select = element as unknown as HTMLSelectElement; select.value = ""; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await expect.poll(() => new URL(page.url()).searchParams.get("source")).toBeNull();
  const download = page.waitForEvent("download"); await page.getByRole("link", { name: labels.export, exact: true }).click(); expect((await download).suggestedFilename()).toMatch(/^crm-report-.*\.xlsx$/);
  await checked(await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process["env"]["E2E_MEMBER_EMAIL"], password: process["env"]["E2E_MEMBER_PASSWORD"] } }));
  await page.goto("/vi/crm/reports"); await expect(page.getByText(labels.empty, { exact: true })).toBeVisible(); await expect(page.getByText(labels.noExport, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: labels.everyone, exact: true }).click(); await expect(orderLink()).toBeVisible();
  expect((await page.request.get("/api/crm/reports/export?from=2026-09-01&to=2026-09-30&scope=everyone")).status()).toBe(403);
  await page.setViewportSize({ width: 375, height: 812 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
