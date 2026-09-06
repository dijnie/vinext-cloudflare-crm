import { expect, test, type APIResponse } from "@playwright/test";
import { getCrmDictionary } from "../../src/lib/i18n/crm-dictionary";
import { getCatalogDictionary } from "../../src/lib/i18n/catalog-dictionary";
import type { FieldDefinition } from "../../src/lib/services/custom-fields/field-contracts";
test.setTimeout(90_000);
async function checked(response: Pick<APIResponse, "ok" | "text" | "json">) { expect(response.ok(), await response.text()).toBe(true); return response.json(); }
for (const locale of ["vi", "en"] as const) {
  test(`${locale}: catalog variants, required fields and private images use actual currency amounts`, async ({ page, baseURL }) => {
    const crm = getCrmDictionary(locale), labels = getCatalogDictionary(locale), headers = { origin: baseURL! }, name = `catalog-${locale}-${crypto.randomUUID().slice(0, 8)}`;
    await checked(await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD } }));
    const premiumSku = `${name}-premium`.padEnd(99, "X") + "\u00a0", premiumLabel = "V".repeat(120);
    const required = await checked(await page.request.post("/api/crm/fields", { headers, data: { entity: "product", type: "text", label: `${name}-required`, required: true } })) as FieldDefinition;
    try {
      await page.goto(`/${locale}/crm/products`); await page.getByRole("button", { name: crm.add, exact: true }).click(); const dialog = page.getByRole("dialog");
      await dialog.locator("#record-name").fill(name); await dialog.locator("#variant-label").fill("Standard");
      await expect(dialog.locator("#variant-priceInput")).toHaveValue("");
      await dialog.locator("#variant-priceInput").fill("12.34"); await dialog.locator(`#custom-${required.id}`).fill("Real required value");
      await dialog.locator("#variant-sku").fill(`${name}-sku`); await dialog.getByRole("button", { name: labels.addAttribute, exact: true }).click();
      await dialog.getByRole("textbox", { name: `${labels.attributeName} 1`, exact: true }).fill("Color"); await dialog.getByRole("textbox", { name: `${labels.attributeValue} 1`, exact: true }).fill("Blue");
      const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=", "base64");
      const upload = page.waitForResponse(response => new URL(response.url()).pathname === "/api/crm/files" && response.request().method() === "POST");
      await dialog.locator("#custom-7dd843dc-6df2-4c33-a8f8-8f45cc0e5762").setInputFiles({ name: `${name}.png`, mimeType: "image/png", buffer: image });
      const uploaded = await checked(await upload);
      const create = page.waitForResponse(response => new URL(response.url()).pathname === "/api/crm/products" && response.request().method() === "POST");
      await dialog.getByRole("button", { name: crm.save, exact: true }).click(); const product = await checked(await create);
      let detail = await checked(await page.request.get(`/api/crm/products/${product.id}`)); expect(detail.priceMinor).toBe(1234); expect(detail.costMinor).toBeNull(); expect(detail.variants[0].attributes).toEqual({ Color: "Blue" });
      const values = await checked(await page.request.get(`/api/crm/fields/values?entity=product&recordId=${product.id}`)); expect(values[required.key]).toBe("Real required value"); expect(values.catalog_images).toEqual([uploaded.id]);
      expect(await (await page.request.get(`/api/crm/files/${uploaded.id}/download`)).body()).toEqual(image);
      await expect(dialog.getByRole("heading", { name: labels.variants, exact: true })).toBeVisible();
      await expect(dialog.locator(`[data-variant-id="${detail.variants[0].id}"]`).getByRole("button", { name: labels.archive, exact: true })).toBeDisabled();
      await dialog.getByRole("button", { name: labels.addVariant, exact: true }).click(); await dialog.locator("#variant-label").fill("Premium"); await dialog.locator("#variant-priceInput").fill("25.50"); await dialog.locator("#variant-costInput").fill("10.25");
      await dialog.locator("#variant-sku").fill(`${name}-sku`);
      const duplicateVariant = page.waitForResponse(response => new URL(response.url()).pathname === `/api/crm/products/${product.id}/variants` && response.request().method() === "POST");
      await dialog.getByRole("button", { name: crm.save, exact: true }).click(); expect((await duplicateVariant).status()).toBe(409);
      await expect(dialog.locator("#variant-label")).toHaveValue("Premium"); await expect(dialog.locator("#variant-sku")).toBeEnabled(); await dialog.locator("#variant-label").fill(premiumLabel); await dialog.locator("#variant-sku").fill(premiumSku);
      const add = page.waitForResponse(response => new URL(response.url()).pathname === `/api/crm/products/${product.id}/variants` && response.request().method() === "POST"); await dialog.getByRole("button", { name: crm.save, exact: true }).click(); const variant = await checked(await add); expect(variant.priceMinor).toBe(2550); expect(variant.costMinor).toBe(1025); expect(variant.sku).toBe(premiumSku); expect(variant.label).toBe(premiumLabel);
      const row = dialog.locator(`[data-variant-id="${variant.id}"]`); await row.getByRole("button", { name: crm.edit, exact: true }).click(); await expect(dialog.locator("#variant-priceInput")).toHaveValue("25.50"); await dialog.locator("#variant-priceInput").fill("30.00");
      await checked(await page.request.patch(`/api/crm/products/${product.id}/variants/${variant.id}`, { headers, data: { action: "update", data: { expectedRevision: variant.revision, priceMinor: 2700 } } }));
      const conflict = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/variants/${variant.id}`) && response.request().method() === "PATCH"); await dialog.getByRole("button", { name: crm.save, exact: true }).click(); expect((await conflict).status()).toBe(409); await expect(dialog.locator("#variant-priceInput")).toHaveValue("30.00");
      await dialog.getByRole("button", { name: labels.reload, exact: true }).click(); await expect(dialog.locator("#variant-priceInput")).toHaveValue("27.00"); await dialog.getByRole("button", { name: crm.cancel, exact: true }).click();
      await row.getByRole("button", { name: labels.archive, exact: true }).click(); await expect(row.getByRole("button", { name: labels.restore, exact: true })).toBeVisible(); await row.getByRole("button", { name: labels.restore, exact: true }).click(); await expect(row.getByRole("button", { name: labels.archive, exact: true })).toBeVisible();
      await page.route(`**/api/crm/products/${product.id}`, route => route.request().method() === "GET" ? route.abort("failed") : route.continue());
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("crm:invalidate", { detail: { kind: "product" } })));
      await expect(dialog.getByRole("button", { name: crm.retry, exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: labels.addVariant, exact: true })).toBeDisabled();
      await expect(dialog.getByRole("button", { name: `${crm.edit}: ${crm.labels.name}`, exact: true })).toBeDisabled();
      await page.unroute(`**/api/crm/products/${product.id}`); await dialog.getByRole("button", { name: crm.retry, exact: true }).click();
      await expect(dialog.getByRole("button", { name: labels.addVariant, exact: true })).toBeEnabled();
      await dialog.getByRole("button", { name: locale === "vi" ? "Thao tác" : "More actions", exact: true }).click();
      await page.getByRole("menuitem", { name: crm.edit, exact: true }).click(); await dialog.locator("#record-name").fill(`${name}-draft`);
      const beforeMetadata = await checked(await page.request.get(`/api/crm/products/${product.id}`));
      await checked(await page.request.patch(`/api/crm/products/${product.id}`, { headers, data: { action: "update", data: { expectedRevision: beforeMetadata.revision, description: "New server description" } } }));
      const staleMetadata = page.waitForResponse(response => new URL(response.url()).pathname === `/api/crm/products/${product.id}` && response.request().method() === "PATCH");
      await dialog.getByRole("button", { name: crm.save, exact: true }).click(); expect((await staleMetadata).status()).toBe(409);
      await expect(dialog.locator("#record-name")).toHaveValue(`${name}-draft`); await expect(dialog.getByRole("button", { name: crm.save, exact: true })).toBeDisabled();
      await dialog.getByRole("button", { name: labels.reload, exact: true }).click(); await expect(dialog.locator("#record-name")).toHaveValue(name); await expect(dialog.locator("#record-description")).toHaveValue("New server description");
      await dialog.locator("#record-name").fill(`${name}-edited`); const metadataSave = page.waitForResponse(response => new URL(response.url()).pathname === `/api/crm/products/${product.id}` && response.request().method() === "PATCH");
      await dialog.getByRole("button", { name: crm.save, exact: true }).click(); await checked(await metadataSave);
      await expect(dialog.getByRole("button", { name: `${crm.edit}: ${crm.labels.name}`, exact: true })).toContainText(`${name}-edited`);
      await expect(dialog.getByText(crm.loading, { exact: true })).toHaveCount(0);
      await page.setViewportSize({ width: 375, height: 812 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: test.info().outputPath(`${locale}-catalog-mobile.png`), animations: "disabled" });
      await row.scrollIntoViewIfNeeded(); await page.screenshot({ path: test.info().outputPath(`${locale}-catalog-long-variant-mobile.png`), animations: "disabled" });
      detail = await checked(await page.request.get(`/api/crm/products/${product.id}`)); expect(detail.variants).toHaveLength(2); expect(detail.variants.find((row: { id: string }) => row.id === variant.id).sku).toBe(premiumSku);
      const modules = await checked(await page.request.get("/api/crm/modules"));
      await checked(await page.request.patch("/api/crm/modules", { headers, data: { ...modules.modules.find((row: { entity: string }) => row.entity === "product"), enabled: false } }));
      try {
        await page.reload(); await expect(dialog.getByRole("button", { name: labels.addVariant, exact: true })).toBeDisabled();
        expect(await (await page.request.get(`/api/crm/files/${uploaded.id}/download`)).body()).toEqual(image);
        expect((await page.request.post(`/api/crm/products/${product.id}/variants`, { headers, data: { label: "Blocked", priceMinor: 100, currency: "USD" } })).status()).toBe(403);
      } finally {
        const latest = await checked(await page.request.get("/api/crm/modules"));
        await checked(await page.request.patch("/api/crm/modules", { headers, data: { ...latest.modules.find((row: { entity: string }) => row.entity === "product"), enabled: true } }));
      }
    } finally { await checked(await page.request.patch(`/api/crm/fields/${required.id}`, { headers, data: { action: "archive" } })); }
  });

  test(`${locale}: service and package forms retain real composition`, async ({ page, baseURL }) => {
    const crm = getCrmDictionary(locale), labels = getCatalogDictionary(locale), headers = { origin: baseURL! }, name = `package-${locale}-${crypto.randomUUID().slice(0, 8)}`;
    await checked(await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD } }));
    await page.goto(`/${locale}/crm/products`); await page.getByRole("button", { name: crm.add, exact: true }).click(); const dialog = page.getByRole("dialog");
    await dialog.locator("#record-name").fill(`${name}-service`); await dialog.locator("#record-kind").click(); await page.getByRole("option", { name: labels.service, exact: true }).click(); await dialog.locator("#variant-label").fill("Session"); await dialog.locator("#variant-priceInput").fill("50.00"); await dialog.locator("#variant-durationMinutes").fill("45");
    await checked(await page.request.post("/api/crm/products", { headers, data: { name: `${name}-existing`, kind: "product", initialVariant: { label: "Existing", sku: `${name}-taken`, priceMinor: 100, currency: "USD" } } }));
    await dialog.locator("#variant-sku").fill(`${name}-taken`);
    const duplicateProduct = page.waitForResponse(response => new URL(response.url()).pathname === "/api/crm/products" && response.request().method() === "POST");
    await dialog.getByRole("button", { name: crm.save, exact: true }).click(); expect((await duplicateProduct).status()).toBe(409);
    await expect(dialog.locator("#record-name")).toHaveValue(`${name}-service`); await expect(dialog.locator("#variant-sku")).toBeEnabled(); await dialog.locator("#variant-sku").fill(`${name}-service-sku`);
    const serviceCreate = page.waitForResponse(response => new URL(response.url()).pathname === "/api/crm/products" && response.request().method() === "POST"); await dialog.getByRole("button", { name: crm.save, exact: true }).click(); const service = await checked(await serviceCreate);
    const serviceDetail = await checked(await page.request.get(`/api/crm/products/${service.id}`)); expect(serviceDetail.kind).toBe("service"); expect(serviceDetail.durationMinutes).toBe(45);
    await page.goto(`/${locale}/crm/products`); await page.getByRole("button", { name: crm.add, exact: true }).click(); await dialog.locator("#record-name").fill(name); await dialog.locator("#record-kind").click(); await page.getByRole("option", { name: labels.package, exact: true }).click(); await dialog.locator("#variant-label").fill("Bundle"); await dialog.locator("#variant-priceInput").fill("90.00");
    await dialog.getByRole("textbox", { name: labels.chooseComponent, exact: true }).fill(`${name}-service`); await dialog.getByRole("button", { name: `${name}-service · Session`, exact: true }).click(); await dialog.getByRole("spinbutton", { name: labels.quantity, exact: true }).fill("2");
    const create = page.waitForResponse(response => new URL(response.url()).pathname === "/api/crm/products" && response.request().method() === "POST"); await dialog.getByRole("button", { name: crm.save, exact: true }).click(); const product = await checked(await create);
    const detail = await checked(await page.request.get(`/api/crm/products/${product.id}`)); expect(detail.kind).toBe("package"); expect(detail.packageComponents).toEqual([expect.objectContaining({ componentVariantId: serviceDetail.variants[0].id, quantity: 2 })]);
    await expect(dialog.getByRole("link", { name: `${name}-service`, exact: true })).toBeVisible();
  });
}

for (const locale of ["vi", "en"] as const) {
  test(`${locale}: category settings retain archived references and recover revision conflicts`, async ({ page, baseURL }) => {
    const crm = getCrmDictionary(locale), labels = getCatalogDictionary(locale), headers = { origin: baseURL! }, name = `category-${locale}-${crypto.randomUUID().slice(0, 8)}`;
    await checked(await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD } }));
    await page.goto(`/${locale}/crm/settings/catalog`); await page.getByRole("textbox", { name: labels.label, exact: true }).fill(name); await page.getByRole("button", { name: crm.add, exact: true }).click(); await expect(page.getByRole("status")).toHaveText(labels.categoriesSaved);
    let catalog = await checked(await page.request.get("/api/crm/product-categories")); const category = catalog.categories.find((row: { label: string }) => row.label === name);
    const row = page.locator(`[data-category-id="${category.id}"]`); await row.getByRole("textbox").fill(`${name}-draft`); await row.getByRole("button", { name: crm.cancel, exact: true }).click(); await expect(row.getByRole("textbox")).toHaveValue(name);
    const product = await checked(await page.request.post("/api/crm/products", { headers, data: { name, kind: "product", categoryId: category.id, initialVariant: { label: "Standard", priceMinor: 1000, currency: "USD" } } }));
    await row.getByRole("button", { name: labels.archive, exact: true }).click(); await expect(row.getByRole("button", { name: labels.restore, exact: true })).toBeVisible(); expect((await checked(await page.request.get(`/api/crm/products/${product.id}`))).categoryId).toBe(category.id);
    await row.getByRole("button", { name: labels.restore, exact: true }).click(); await expect(row.getByRole("button", { name: labels.archive, exact: true })).toBeVisible();
    catalog = await checked(await page.request.get("/api/crm/product-categories")); await checked(await page.request.patch("/api/crm/product-categories", { headers, data: { action: "relabel", id: category.id, revision: catalog.revision, label: `${name}-server` } }));
    await row.getByRole("textbox").fill(`${name}-local`); await row.getByRole("button", { name: crm.save, exact: true }).click(); await expect(page.getByRole("alert")).toHaveText(labels.conflict); await expect(row.getByRole("textbox")).toHaveValue(`${name}-local`); await page.getByRole("button", { name: labels.reload, exact: true }).click(); await expect(row.getByRole("textbox")).toHaveValue(`${name}-server`);
    await page.setViewportSize({ width: 375, height: 812 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: test.info().outputPath(`${locale}-catalog-categories-mobile.png`), animations: "disabled" });
  });
}

test("member reads catalog categories but cannot configure them", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  await checked(await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_MEMBER_EMAIL, password: process.env.E2E_MEMBER_PASSWORD } }));
  const catalog = await checked(await page.request.get("/api/crm/product-categories")); expect(catalog.canManage).toBe(false);
  expect((await page.request.patch("/api/crm/product-categories", { headers, data: { action: "create", revision: catalog.revision, label: "Forbidden" } })).status()).toBe(403);
  expect((await page.goto("/en/crm/settings/catalog"))?.status()).toBe(404);
});
