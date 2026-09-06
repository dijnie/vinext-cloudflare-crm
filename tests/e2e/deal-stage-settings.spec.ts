import { expect, test, type APIResponse } from "@playwright/test";
import { getCrmDictionary } from "../../src/lib/i18n/crm-dictionary";
import { getDealStageDictionary } from "../../src/lib/i18n/deal-stage-dictionary";
import type { DealStageCatalog } from "../../src/lib/services/deals/deal-stage-contracts";
async function checked(response: Pick<APIResponse, "ok" | "text" | "json">) { expect(response.ok(), await response.text()).toBe(true); return response.json(); }
for (const locale of ["vi", "en"] as const) {
  test(`${locale}: custom stage lifecycle works across forms, history and reporting`, async ({ page, context, baseURL }) => {
    const headers = { origin: baseURL! }, crm = getCrmDictionary(locale), labels = getDealStageDictionary(locale);
    await checked(await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD } }));
    const read = async () => await checked(await page.request.get("/api/crm/deal-stages")) as DealStageCatalog;
    const prefix = `stages-${locale}-${crypto.randomUUID().slice(0, 6)}`;
    const stageIds: Record<string, string> = {};
    await page.goto(`/${locale}/crm/settings/deal-stages`);
    await expect(page.getByRole("heading", { name: labels.title, exact: true })).toBeVisible();
    await expect(page.locator('[data-stage-id="demo-booked"]').getByRole("button", { name: labels.archive, exact: true })).toBeDisabled();
    for (const state of ["open", "won", "lost"] as const) {
      await page.getByLabel(labels.label, { exact: true }).fill(`${prefix}-${state}`);
      await page.locator("#new-stage-meaning").click();
      await page.getByRole("option", { name: labels[state], exact: true }).click();
      const response = page.waitForResponse(item => new URL(item.url()).pathname === "/api/crm/deal-stages" && item.request().method() === "PATCH");
      await page.getByRole("button", { name: crm.add, exact: true }).click();
      stageIds[state] = (await checked(await response) as DealStageCatalog).stages.find(stage => stage.label === `${prefix}-${state}`)!.id;
    }
    const openRow = page.locator(`[data-stage-id="${stageIds.open}"]`);
    await openRow.getByRole("textbox").fill(`${prefix}-cancelled`);
    await openRow.getByRole("button", { name: crm.cancel, exact: true }).click();
    await expect(openRow.getByRole("textbox")).toHaveValue(`${prefix}-open`);
    const renamed = `${prefix}-renamed`;
    await openRow.getByRole("textbox").fill(renamed);
    await openRow.getByRole("button", { name: crm.save, exact: true }).click();
    await expect(openRow.getByRole("textbox")).toHaveValue(renamed);
    const beforeMove = (await read()).stages.findIndex(stage => stage.id === stageIds.open);
    await openRow.getByRole("button", { name: `${labels.up}: ${renamed}`, exact: true }).click();
    await expect.poll(async () => (await read()).stages.findIndex(stage => stage.id === stageIds.open)).toBe(beforeMove - 1);
    await page.setViewportSize({ width: 375, height: 812 });
    await openRow.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`${locale}-deal-stage-settings-mobile.png`), animations: "disabled" });

    const company = await checked(await page.request.post("/api/crm/companies", { headers, data: { name: `${prefix}-company` } }));
    const owners = await checked(await page.request.get("/api/crm/owners"));
    const ownerId = owners.rows.find((row: { email: string }) => row.email === process.env.E2E_OWNER_EMAIL).membershipId;
    await page.goto(`/${locale}/crm/deals?q=${prefix}`);
    await page.getByRole("button", { name: crm.add, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#record-name").fill(prefix);
    await dialog.locator("#record-companyId").click();
    await page.getByPlaceholder(crm.chooseCompany, { exact: true }).fill(`${prefix}-company`);
    await page.getByRole("option", { name: `${prefix}-company`, exact: true }).click();
    await expect(dialog.locator("#record-ownerMembershipId")).toHaveAttribute("aria-busy", "false");
    await dialog.locator("#record-ownerMembershipId").click();
    await page.locator(`[role="option"][data-value="${ownerId}"]`).click();
    await dialog.locator("#record-stageId").click();
    await page.getByRole("option", { name: renamed, exact: true }).click();
    await dialog.locator("#record-amountMinor").fill("12345");
    const creation = page.waitForResponse(item => new URL(item.url()).pathname === "/api/crm/deals" && item.request().method() === "POST");
    await dialog.getByRole("button", { name: crm.save, exact: true }).click();
    const deal = await checked(await creation);
    expect(await checked(await page.request.get(`/api/crm/deals/${deal.id}`))).toMatchObject({ stageId: stageIds.open, closedState: "open" });
    await page.goto(`/${locale}/crm/deals?q=${prefix}`);
    await page.getByRole("button", { name: `${crm.labels.stageId}: ${renamed}`, exact: true }).click();
    await page.getByRole("menuitemradio", { name: `${prefix}-won`, exact: true }).click();
    await expect.poll(async () => (await checked(await page.request.get(`/api/crm/deals/${deal.id}`))).closedState).toBe("won");
    await page.goto(`/${locale}/crm/deals?q=${prefix}&recordType=deal&recordId=${deal.id}`);
    await dialog.getByRole("button", { name: `${crm.edit}: ${crm.labels.stage}`, exact: true }).click();
    await dialog.locator(`#inline-stage-${deal.id}`).click();
    await page.getByRole("option", { name: renamed, exact: true }).click();
    await expect.poll(async () => (await checked(await page.request.get(`/api/crm/deals/${deal.id}`))).stageId).toBe(stageIds.open);
    await dialog.getByRole("button", { name: crm.activities, exact: true }).click();
    await expect(dialog.getByText(new RegExp(renamed)).first()).toBeVisible();
    await expect(dialog.getByText(new RegExp(`${prefix}-won`)).first()).toBeVisible();

    // A separate configuration tab archives the current stage during a main-form draft.
    await page.goto(`/${locale}/crm/deals?q=${prefix}&recordType=deal&recordId=${deal.id}`);
    await dialog.getByRole("button", { name: locale === "vi" ? "Thao tác" : "More actions", exact: true }).click();
    await page.getByRole("menuitem", { name: crm.edit, exact: true }).click();
    await dialog.locator("#record-name").fill(`${prefix}-draft`);
    await dialog.locator("#record-stageId").click();
    await page.getByRole("option", { name: `${prefix}-won`, exact: true }).click();
    const settingsTab = await context.newPage();
    try {
      await settingsTab.goto(`/${locale}/crm/settings/deal-stages`);
      const row = settingsTab.locator(`[data-stage-id="${stageIds.open}"]`);
      const wonRow = settingsTab.locator(`[data-stage-id="${stageIds.won}"]`);
      await wonRow.getByRole("button", { name: labels.archive, exact: true }).click();
      await expect(wonRow.getByRole("button", { name: labels.restore, exact: true })).toBeVisible();
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(dialog.getByRole("button", { name: crm.save, exact: true })).toBeDisabled();
      await expect(dialog.locator("#record-name")).toHaveValue(`${prefix}-draft`);
      await dialog.locator("#record-stageId").click();
      await page.getByRole("option", { name: renamed, exact: true }).click();
      await expect(dialog.getByRole("button", { name: crm.save, exact: true })).toBeEnabled();
      await row.getByRole("button", { name: labels.archive, exact: true }).click();
      await expect(row.getByRole("button", { name: labels.restore, exact: true })).toBeVisible();
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(dialog.locator("#record-stageId")).toContainText(crm.archived);
      await expect(dialog.locator("#record-name")).toHaveValue(`${prefix}-draft`);
      await page.screenshot({ path: test.info().outputPath(`${locale}-archived-stage-editor-mobile.png`), animations: "disabled" });
      const update = page.waitForResponse(item => new URL(item.url()).pathname === `/api/crm/deals/${deal.id}` && item.request().method() === "PATCH");
      await dialog.getByRole("button", { name: crm.save, exact: true }).click();
      await checked(await update);
      expect((await checked(await page.request.get(`/api/crm/deals/${deal.id}`))).stageId).toBe(stageIds.open);
      const summary = await checked(await page.request.get("/api/crm/dashboard?scope=everyone"));
      expect(summary.pipeline.stages.find((stage: { stageId: string }) => stage.stageId === stageIds.open)).toMatchObject({ stageLabel: renamed, count: 1, valueMinor: "12345" });
      await page.goto(`/${locale}/crm/deals?q=${prefix}`);
      await page.getByRole("button", { name: crm.add, exact: true }).click();
      await dialog.locator("#record-stageId").click();
      await expect(page.getByRole("option", { name: renamed, exact: true })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await dialog.getByRole("button", { name: crm.cancel, exact: true }).click();
      // Historical custom IDs remain valid URL filters and saved-view state.
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/${locale}/crm/deals?q=${prefix}&stage=${stageIds.open}`);
      await expect(page.getByRole("link", { name: `${prefix}-draft`, exact: true })).toBeVisible();
      await page.getByRole("button", { name: crm.views.title, exact: true }).click();
      await page.getByRole("menuitem", { name: crm.views.add, exact: true }).click();
      await page.getByRole("dialog").getByLabel(crm.views.name, { exact: true }).fill(`${prefix}-view`);
      await page.getByRole("dialog").getByRole("button", { name: crm.save, exact: true }).click();
      const views = await checked(await page.request.get("/api/crm/saved-views?entity=deal"));
      const view = views.find((item: { name: string }) => item.name === `${prefix}-view`);
      expect(new URLSearchParams(view.state.query).get("stage")).toBe(stageIds.open);
      await page.reload();
      await expect(page.getByRole("link", { name: `${prefix}-draft`, exact: true })).toBeVisible();
      await row.getByRole("button", { name: labels.restore, exact: true }).click();
      await expect(row.getByRole("button", { name: labels.archive, exact: true })).toBeVisible();
      // The original settings tab loses a real revision race to another owner write.
      const latest = await read();
      await checked(await page.request.patch("/api/crm/deal-stages", { headers, data: { action: "relabel", id: stageIds.lost, label: `${prefix}-lost-renamed`, revision: latest.revision } }));
      await row.getByRole("textbox").fill(`${renamed}-stale`);
      await row.getByRole("button", { name: crm.save, exact: true }).click();
      await expect(settingsTab.getByRole("alert")).toHaveText(labels.conflict);
      await settingsTab.getByRole("button", { name: labels.reload, exact: true }).click();
      await expect(row.getByRole("textbox")).toHaveValue(renamed);
    } finally { await settingsTab.close(); }
    // Related sheet counts use semantics rather than a closed-* ID prefix.
    await checked(await page.request.post("/api/crm/deals", { headers, data: { name: `${prefix}-loss`, companyId: company.id, ownerMembershipId: ownerId, stageId: stageIds.lost } }));
    await checked(await page.request.post("/api/crm/deals", { headers, data: { name: `${prefix}-unqualified`, companyId: company.id, ownerMembershipId: ownerId, stageId: "unqualified-to-buy" } }));
    await page.goto(`/${locale}/crm/companies?q=${prefix}&recordType=company&recordId=${company.id}`);
    const count = dialog.locator("dl").first().locator("div").filter({ has: page.locator("dt", { hasText: crm.deal }) }).locator("dd");
    await expect(count).toHaveText("1");
    await page.goto(`/${locale}/crm`);
    await expect(page.getByText(renamed, { exact: true }).first()).toBeVisible();
  });
}

test("member reads stage catalog but cannot open or mutate owner configuration", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  await checked(await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_MEMBER_EMAIL, password: process.env.E2E_MEMBER_PASSWORD } }));
  const catalog = await checked(await page.request.get("/api/crm/deal-stages")) as DealStageCatalog;
  expect(catalog.canManage).toBe(false);
  expect((await page.request.patch("/api/crm/deal-stages", { headers, data: { action: "create", label: "Denied", closedState: "open", revision: catalog.revision } })).status()).toBe(403);
  expect((await page.goto("/en/crm/settings/deal-stages"))?.status()).toBe(404);
});
