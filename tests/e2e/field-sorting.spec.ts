import { expect, test } from "@playwright/test";
import { getCrmDictionary } from "../../src/lib/i18n/crm-dictionary";
import type { FieldDefinition } from "../../src/lib/services/custom-fields/field-contracts";
import type { SavedView } from "../../src/lib/services/saved-views/saved-view-contracts";

for (const locale of ["vi", "en"] as const) {
  test(`${locale}: scalar field sorting precedes pagination and persists in personal default views`, async ({ page, baseURL }) => {
    const labels = getCrmDictionary(locale);
    const headers = { origin: baseURL! };
    expect((await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD } })).ok()).toBe(true);
    const prefix = `sort-${locale}-${crypto.randomUUID().slice(0, 8)}`;
    async function createField(data: object) { const response = await page.request.post("/api/crm/fields", { headers, data: { entity: "company", ...data } }); expect(response.ok()).toBe(true); return await response.json() as FieldDefinition; }
    const number = await createField({ type: "number", label: `${prefix}-number`, showOnTable: true });
    const formula = await createField({ type: "formula", label: `${prefix}-formula`, config: { expression: `100 / [${number.key}]` }, showOnTable: true });
    const money = await createField({ type: "money", label: `${prefix}-money` });
    for (const [name, value] of [["high", 20], ["low", 2], ["missing", null]] as const) {
      const response = await page.request.post("/api/crm/companies", { headers, data: { name: `${prefix}-${name}` } });
      expect(response.ok()).toBe(true);
      const record = await response.json();
      if (value !== null) expect((await page.request.patch("/api/crm/fields/values", { headers, data: { entity: "company", recordId: record.id, values: { [number.key]: value } } })).ok()).toBe(true);
    }
    const path = `/${locale}/crm/companies`;
    const currentRow = (suffix: string) => page.locator("tbody").getByRole("link", { name: `${prefix}-${suffix}`, exact: true });
    let viewId: string | undefined;
    try {
      await page.goto(`${path}?${new URLSearchParams({ q: prefix, pageSize: "1", sort: "name", dir: "asc" })}`);
      await page.getByRole("button", { name: labels.sort, exact: true }).click();
      await expect(page.getByRole("menuitemradio", { name: money.label, exact: true })).toHaveCount(0);
      await page.getByRole("menuitemradio", { name: number.label, exact: true }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe(`field:${number.key}`);
      await expect(currentRow("low")).toBeVisible();
      await expect(page.locator("tbody tr")).toHaveCount(1);
      await page.getByRole("button", { name: labels.next, exact: true }).click();
      await expect(currentRow("high")).toBeVisible();
      await page.getByRole("button", { name: labels.next, exact: true }).click();
      await expect(currentRow("missing")).toBeVisible();
      await page.getByRole("columnheader", { name: number.label, exact: true }).getByRole("button").click();
      await page.getByRole("menuitem", { name: labels.desc, exact: true }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get("dir")).toBe("desc");
      await expect(currentRow("high")).toBeVisible();
      await page.getByRole("button", { name: labels.next, exact: true }).click();
      await expect(currentRow("low")).toBeVisible();
      await page.getByRole("button", { name: labels.next, exact: true }).click();
      await expect(currentRow("missing")).toBeVisible();
      await page.getByRole("columnheader", { name: formula.label, exact: true }).getByRole("button").click();
      await page.getByRole("menuitem", { name: labels.asc, exact: true }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe(`field:${formula.key}`);
      await expect(currentRow("high")).toBeVisible();
      await page.getByRole("columnheader", { name: formula.label, exact: true }).getByRole("button").click();
      await page.getByRole("menuitem", { name: labels.desc, exact: true }).click();
      await expect(currentRow("low")).toBeVisible();
      await page.getByRole("button", { name: labels.views.title, exact: true }).click();
      await page.getByRole("menuitem", { name: labels.views.add, exact: true }).click();
      await page.getByRole("dialog").getByLabel(labels.views.name, { exact: true }).fill(prefix);
      await page.getByRole("dialog").getByRole("button", { name: labels.save, exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const viewsResponse = await page.request.get("/api/crm/saved-views?entity=company");
      expect(viewsResponse.ok()).toBe(true);
      const view = (await viewsResponse.json() as SavedView[]).find(item => item.name === prefix)!;
      viewId = view.id;
      expect(new URLSearchParams(view.state.query).get("sort")).toBe(`field:${formula.key}`);
      await page.getByRole("button", { name: prefix, exact: true }).click();
      await page.getByRole("menuitem", { name: `${labels.edit} ${prefix}`, exact: true }).hover();
      await page.getByRole("menuitem", { name: labels.views.setDefault, exact: true }).click();
      await expect(page.getByText(labels.views.default, { exact: true })).toBeVisible();
      await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
      await page.goto(path);
      await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe(`field:${formula.key}`);
      expect(new URL(page.url()).searchParams.get("dir")).toBe("desc");
      expect(new URL(page.url()).searchParams.get("pageSize")).toBe("1");
      await expect(currentRow("low")).toBeVisible();
      await page.setViewportSize({ width: 375, height: 812 });
      const disclosure = page.getByRole("button", { name: labels.filters, exact: true }).and(page.locator("[aria-controls]:not([aria-haspopup])"));
      await disclosure.press("Enter");
      await page.getByRole("button", { name: labels.sort, exact: true }).press("Enter");
      await expect(page.getByRole("menuitemradio", { name: formula.label, exact: true })).toHaveAttribute("aria-checked", "true");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`${locale}-field-sorting-mobile.png`), animations: "disabled" });
    } finally {
      expect((await page.request.put("/api/crm/saved-views/default", { headers, data: { entity: "company", viewId: null } })).ok()).toBe(true);
      if (viewId) expect((await page.request.delete(`/api/crm/saved-views/${viewId}`, { headers: { ...headers, "Content-Type": "application/json" } })).ok()).toBe(true);
    }
  });
}
