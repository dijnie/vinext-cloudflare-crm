import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { getCrmDictionary } from "../../src/lib/i18n/crm-dictionary";
import { getOrderDictionary } from "../../src/lib/i18n/order-dictionary";

test.setTimeout(120_000);
async function checked(response: Pick<APIResponse, "ok" | "text" | "json">) {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function orderDraft(page: Page, headers: { origin: string }) {
  return checked(await page.request.post("/api/crm/record-drafts", { headers, data: { entity: "order" } }));
}
async function fixture(page: Page, origin: string, kind: "product" | "service" = "product") {
  const headers = { origin }, name = `order-${crypto.randomUUID().slice(0, 8)}`;
  await checked(await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD } }));
  const contact = await checked(await page.request.post("/api/crm/contacts", { headers, data: { firstName: name, lastName: "Buyer" } }));
  const product = await checked(await page.request.post("/api/crm/products", { headers, data: { name, kind, initialVariant: { label: "Standard", priceMinor: 1234, currency: "USD" } } }));
  const detail = await checked(await page.request.get(`/api/crm/products/${product.id}`));
  const variant = detail.variants[0];
  const draft = await orderDraft(page, headers);
  const createData = { draftId: draft.id, name, contactId: contact.id, currency: "USD", lines: [{ variantId: variant.id, expectedVariantRevision: variant.revision, expectedProductRevision: detail.revision, quantity: 1 }] };
  return { headers, name, contact, product: detail, variant, createData };
}
for (const locale of ["vi", "en"] as const) {
  test(`${locale}: order preview, fulfillment, adjustment and separate money history`, async ({ page, baseURL }) => {
    const { name, contact, headers } = await fixture(page, baseURL!);
    const labels = getOrderDictionary(locale), crm = getCrmDictionary(locale);
    const required = await checked(await page.request.post("/api/crm/fields", { headers, data: { entity: "order", type: "text", label: `${name}-required`, required: true } }));
    const file = await checked(await page.request.post("/api/crm/fields", { headers, data: { entity: "order", type: "file", label: `${name}-file`, required: true } }));
    try {
      await page.goto(`/${locale}/crm/orders`);
      await page.getByRole("button", { name: crm.add, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.locator("#record-name").fill(name);
      await dialog.getByRole("textbox", { name: labels.chooseCustomer, exact: true }).fill(name);
      await dialog.getByRole("button", { name: `${name} Buyer`, exact: true }).click();
      await dialog.getByRole("textbox", { name: labels.chooseVariant, exact: true }).fill(name);
      await dialog.getByRole("button", { name: `${name} · Standard`, exact: true }).click();
      await dialog.getByRole("spinbutton", { name: labels.quantity, exact: true }).fill("2");
      await dialog.getByRole("spinbutton", { name: labels.unitPrice, exact: true }).fill("15.00");
      await dialog.getByRole("spinbutton", { name: labels.lineDiscount, exact: true }).fill("1.00");
      await dialog.getByRole("spinbutton", { name: labels.orderDiscount, exact: true }).fill("2.00");
      await dialog.getByRole("spinbutton", { name: labels.surcharge, exact: true }).fill("3.00");
      await dialog.getByRole("spinbutton", { name: labels.tax, exact: true }).fill("1.00");
      await dialog.locator(`#custom-${required.id}`).fill("Required atomic order value");
      const content = Buffer.from("Private customer order attachment");
      const upload = page.waitForResponse(response => new URL(response.url()).pathname === "/api/crm/files" && response.request().method() === "POST");
      await dialog.locator(`#custom-${file.id}`).setInputFiles({ name: `${name}.txt`, mimeType: "text/plain", buffer: content });
      const uploaded = await checked(await upload);
      const preview = page.waitForResponse(response => new URL(response.url()).pathname === "/api/crm/orders/preview" && response.request().method() === "POST");
      await dialog.getByRole("button", { name: labels.preview, exact: true }).click();
      expect((await checked(await preview)).originalMinor).toBe(3100);
      const created = page.waitForResponse(response => new URL(response.url()).pathname === "/api/crm/orders" && response.request().method() === "POST");
      await dialog.getByRole("button", { name: crm.save, exact: true }).click();
      const order = await checked(await created);
      let current = await checked(await page.request.get(`/api/crm/orders/${order.id}`));
      expect(current).toMatchObject({ state: "draft", originalMinor: 3100, collectedMinor: 0, contactId: contact.id });
      expect((await checked(await page.request.get(`/api/crm/fields/values?entity=order&recordId=${order.id}`)))[required.key]).toBe("Required atomic order value");
      expect(await (await page.request.get(`/api/crm/files/${uploaded.id}/download`)).body()).toEqual(content);
      async function operation(action: "confirm" | "complete" | "cancelOrder" | "collect" | "refund" | "adjust", fill?: (form: ReturnType<Page["locator"]>) => Promise<void>) {
        await dialog.getByRole("button", { name: labels[action], exact: true }).click();
        const form = dialog.locator("form").filter({ has: page.getByRole("heading", { name: labels[action], exact: true }) });
        await expect(form.getByLabel(labels.businessDate, { exact: true })).not.toHaveValue("");
        await form.getByLabel(labels.reason, { exact: true }).fill(`${action} actual business event`);
        if (fill) await fill(form);
        const response = page.waitForResponse(row => new URL(row.url()).pathname === `/api/crm/orders/${order.id}/${action === "collect" || action === "refund" ? "payments" : "commands"}` && row.request().method() === "POST");
        await form.getByRole("button", { name: crm.save, exact: true }).click();
        await checked(await response); await expect(form).toHaveCount(0);
      }
      await operation("confirm");
      await operation("collect", async form => { await form.getByLabel(`${labels.amount} (USD)`, { exact: true }).fill("40.00"); await form.getByLabel(labels.method, { exact: true }).fill("Cash"); });
      await operation("complete");
      current = await checked(await page.request.get(`/api/crm/orders/${order.id}`));
      expect(current).toMatchObject({ state: "completed", collectedMinor: 4000, balanceMinor: "-900" });
      await operation("adjust", async form => { await form.getByLabel(`${labels.goodsReduction} (USD)`, { exact: true }).fill("1.00"); });
      await operation("cancelOrder");
      current = await checked(await page.request.get(`/api/crm/orders/${order.id}`));
      expect(current).toMatchObject({ state: "cancelled", originalMinor: 3100, goodsRemainingMinor: 0, balanceMinor: "-4000" });
      await operation("refund", async form => { await form.getByLabel(`${labels.amount} (USD)`, { exact: true }).fill("40.00"); await form.getByLabel(labels.method, { exact: true }).fill("Cash"); });
      current = await checked(await page.request.get(`/api/crm/orders/${order.id}`));
      expect(current).toMatchObject({ collectedMinor: 4000, refundedMinor: 4000, balanceMinor: "0" });
      expect((await checked(await page.request.get(`/api/crm/orders/${order.id}/payments`))).rows).toHaveLength(2);
      const history = (await checked(await page.request.get(`/api/crm/orders/${order.id}/commands`))).rows;
      expect(history).toHaveLength(6); expect(history.find((row: { action: string }) => row.action === "adjust").adjustment.goodsMinor).toBe(100);
      await expect(dialog.getByRole("button", { name: labels.collect, exact: true })).toHaveCount(0);
      await expect(dialog.getByText(labels.loading, { exact: true })).toHaveCount(0);
      await page.setViewportSize({ width: 375, height: 812 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`${locale}-order-ledger-mobile.png`), animations: "disabled" });
    } finally { for (const field of [required, file]) await checked(await page.request.patch(`/api/crm/fields/${field.id}`, { headers, data: { action: "archive" } })); }
  });
}

test("uncertain collection retry preserves entered values and writes only once", async ({ page, baseURL }) => {
  const { headers, createData } = await fixture(page, baseURL!);
  const order = await checked(await page.request.post("/api/crm/orders", { headers, data: createData }));
  const settings = await checked(await page.request.get("/api/crm/settings"));
  await checked(await page.request.post(`/api/crm/orders/${order.id}/commands`, { headers, data: { action: "confirm", expectedRevision: order.revision, calendarRevision: settings.revision, operationKey: crypto.randomUUID() } }));
  const labels = getOrderDictionary("en"), crm = getCrmDictionary("en");
  await page.goto(`/en/crm/orders?recordType=order&recordId=${order.id}`);
  const dialog = page.getByRole("dialog"); await dialog.getByRole("button", { name: labels.collect, exact: true }).click();
  const form = dialog.locator("form"); await form.getByLabel(`${labels.amount} (USD)`, { exact: true }).fill("12.34"); await form.getByLabel(labels.method, { exact: true }).fill("Bank transfer");
  await expect(form.getByLabel(labels.businessDate, { exact: true })).not.toHaveValue("");
  let operationKey = "";
  await page.route(`**/api/crm/orders/${order.id}/payments`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    operationKey = route.request().postDataJSON().operationKey;
    const response = await route.fetch(); expect(response.ok()).toBe(true); await route.abort("failed");
  });
  await form.getByRole("button", { name: crm.save, exact: true }).click();
  await expect(form.getByRole("button", { name: labels.retry, exact: true })).toBeVisible();
  await expect(form.getByLabel(`${labels.amount} (USD)`, { exact: true })).toHaveValue("12.34");
  await expect(form.getByLabel(labels.method, { exact: true })).toHaveValue("Bank transfer");
  await page.unroute(`**/api/crm/orders/${order.id}/payments`);
  const retry = page.waitForRequest(request => new URL(request.url()).pathname === `/api/crm/orders/${order.id}/payments` && request.method() === "POST");
  await form.getByRole("button", { name: labels.retry, exact: true }).click();
  expect((await retry).postDataJSON().operationKey).toBe(operationKey); await expect(form).toHaveCount(0);
  expect((await checked(await page.request.get(`/api/crm/orders/${order.id}/payments`))).rows).toHaveLength(1);
  expect((await checked(await page.request.get(`/api/crm/orders/${order.id}`))).collectedMinor).toBe(1234);
});

test("Vietnamese inventory configuration, receipt, actual return and immutable history", async ({ page, baseURL }) => {
  const { headers, name, variant, createData } = await fixture(page, baseURL!);
  const labels = getOrderDictionary("vi"), crm = getCrmDictionary("vi");
  await page.goto("/vi/crm/inventory"); await page.getByRole("textbox", { name: labels.chooseVariant, exact: true }).fill(name);
  const row = page.locator(`[data-inventory-variant-id="${variant.id}"]`);
  await row.getByRole("button", { name: crm.edit, exact: true }).click();
  await row.getByLabel(labels.inventoryTracking, { exact: true }).check(); await row.getByRole("button", { name: crm.save, exact: true }).click();
  await row.getByRole("button", { name: labels.stockReceipt, exact: true }).click();
  let form = row.locator("form"); await form.getByLabel(labels.quantity, { exact: true }).fill("5"); await form.getByLabel(labels.reason, { exact: true }).fill("Hàng thực nhập kho");
  await expect(form.getByLabel(labels.businessDate, { exact: true })).not.toHaveValue("");
  await form.getByRole("button", { name: crm.save, exact: true }).click(); await expect(form).toHaveCount(0);
  expect((await checked(await page.request.get(`/api/crm/inventory/variants/${variant.id}`))).onHand).toBe(5);
  const order = await checked(await page.request.post("/api/crm/orders", { headers, data: createData }));
  const settings = await checked(await page.request.get("/api/crm/settings"));
  for (const action of ["confirm", "complete"] as const) {
    const current = await checked(await page.request.get(`/api/crm/orders/${order.id}`));
    await checked(await page.request.post(`/api/crm/orders/${order.id}/commands`, { headers, data: { action, expectedRevision: current.revision, calendarRevision: settings.revision, operationKey: crypto.randomUUID() } }));
  }
  await page.reload(); await page.getByRole("textbox", { name: labels.chooseVariant, exact: true }).fill(name);
  await row.getByRole("button", { name: labels.stockReturn, exact: true }).click(); form = row.locator("form");
  await form.getByLabel(labels.quantity, { exact: true }).fill("1"); await form.getByLabel(labels.reason, { exact: true }).fill("Khách đã trả hàng thực tế");
  await form.getByLabel(labels.title, { exact: true }).fill(name); await form.getByRole("button", { name: new RegExp(name) }).click();
  await expect(form.getByLabel(labels.businessDate, { exact: true })).not.toHaveValue("");
  await form.getByRole("button", { name: crm.save, exact: true }).click(); await expect(form).toHaveCount(0);
  expect((await checked(await page.request.get(`/api/crm/inventory/variants/${variant.id}`))).onHand).toBe(5);
  const history = (await checked(await page.request.get(`/api/crm/inventory/variants/${variant.id}/history`))).rows;
  expect(history).toHaveLength(3); expect(history.map((entry: { quantity: number }) => entry.quantity).sort()).toEqual([-1, 1, 5]);
  await row.getByRole("button", { name: labels.history, exact: true }).click(); await expect(row.getByText("Khách đã trả hàng thực tế", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("vi-inventory-history-mobile.png"), animations: "disabled" });
});

test("package entitlement use and reversal keep buyer and immutable history", async ({ page, baseURL }) => {
  const { headers, name, contact, variant } = await fixture(page, baseURL!, "service");
  const labels = getOrderDictionary("en"), crm = getCrmDictionary("en");
  await checked(await page.request.patch(`/api/crm/inventory/variants/${variant.id}`, { headers, data: { expectedRevision: 0, stockTracked: false, sessionUnits: 3, expiryDays: null } }));
  const product = await checked(await page.request.post("/api/crm/products", { headers, data: { name: `${name}-package`, kind: "package", initialVariant: { label: "Three visits", priceMinor: 3000, currency: "USD" }, packageComponents: [{ componentVariantId: variant.id, quantity: 1 }] } }));
  const detail = await checked(await page.request.get(`/api/crm/products/${product.id}`));
  const draft = await orderDraft(page, headers);
  const order = await checked(await page.request.post("/api/crm/orders", { headers, data: { draftId: draft.id, name, contactId: contact.id, currency: "USD", lines: [{ variantId: detail.variants[0].id, expectedVariantRevision: detail.variants[0].revision, expectedProductRevision: detail.revision, quantity: 1 }] } }));
  const settings = await checked(await page.request.get("/api/crm/settings"));
  for (const action of ["confirm", "complete"] as const) {
    const current = await checked(await page.request.get(`/api/crm/orders/${order.id}`));
    await checked(await page.request.post(`/api/crm/orders/${order.id}/commands`, { headers, data: { action, expectedRevision: current.revision, calendarRevision: settings.revision, operationKey: crypto.randomUUID() } }));
  }
  const entitlement = (await checked(await page.request.get(`/api/crm/entitlements?orderId=${order.id}`))).rows[0];
  expect(entitlement).toMatchObject({ contactId: contact.id, granted: 3, remaining: 3, used: 0 });
  await page.goto(`/en/crm/orders?recordType=order&recordId=${order.id}`); const dialog = page.getByRole("dialog");
  for (const [action, reason] of [["consume", "Customer attended"], ["reverseUse", "Correct attendance entry"]] as const) {
    await dialog.getByRole("button", { name: labels[action], exact: true }).click();
    const form = dialog.locator("form"); await form.getByLabel(labels.quantity, { exact: true }).fill("1"); await form.getByLabel(labels.reason, { exact: true }).fill(reason);
    await expect(form.getByLabel(labels.businessDate, { exact: true })).not.toHaveValue("");
    await form.getByRole("button", { name: crm.save, exact: true }).click(); await expect(form).toHaveCount(0);
  }
  expect(await checked(await page.request.get(`/api/crm/entitlements/${entitlement.id}`))).toMatchObject({ contactId: contact.id, remaining: 3, used: 0 });
  const history = (await checked(await page.request.get(`/api/crm/entitlements/${entitlement.id}/history`))).rows;
  expect(history).toHaveLength(3); expect(history.map((row: { kind: string }) => row.kind).sort()).toEqual(["grant", "restore", "use"]);
  await dialog.locator(`[data-entitlement-id="${entitlement.id}"]`).getByRole("button", { name: labels.history, exact: true }).click();
  await expect(dialog.getByText("Correct attendance entry", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole("heading", { name: labels.entitlement, exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("en-entitlement-history-mobile.png"), animations: "disabled" });
});

test("stale payment review keeps the entered draft and uses the fresh order revision", async ({ page, baseURL }) => {
  const { headers, createData } = await fixture(page, baseURL!);
  const order = await checked(await page.request.post("/api/crm/orders", { headers, data: createData }));
  const settings = await checked(await page.request.get("/api/crm/settings"));
  const confirmed = await checked(await page.request.post(`/api/crm/orders/${order.id}/commands`, { headers, data: { action: "confirm", expectedRevision: order.revision, calendarRevision: settings.revision, operationKey: crypto.randomUUID() } }));
  const labels = getOrderDictionary("en"), crm = getCrmDictionary("en");
  await page.goto(`/en/crm/orders?recordType=order&recordId=${order.id}`);
  const dialog = page.getByRole("dialog"); await dialog.getByRole("button", { name: labels.collect, exact: true }).click();
  const form = dialog.locator("form"); await form.getByLabel(`${labels.amount} (USD)`, { exact: true }).fill("10.00"); await form.getByLabel(labels.method, { exact: true }).fill("Cash");
  await expect(form.getByLabel(labels.businessDate, { exact: true })).not.toHaveValue("");
  await checked(await page.request.post(`/api/crm/orders/${order.id}/commands`, { headers, data: { action: "adjust", goodsMinor: 100, expectedRevision: confirmed.revision, calendarRevision: settings.revision, operationKey: crypto.randomUUID(), reason: "Server correction" } }));
  const failed = page.waitForResponse(response => new URL(response.url()).pathname === `/api/crm/orders/${order.id}/payments` && response.request().method() === "POST");
  await form.getByRole("button", { name: crm.save, exact: true }).click(); expect((await failed).status()).toBe(409);
  await form.getByRole("button", { name: labels.refresh, exact: true }).click();
  await expect(form.getByLabel(`${labels.amount} (USD)`, { exact: true })).toHaveValue("10.00"); await expect(form.getByLabel(labels.method, { exact: true })).toHaveValue("Cash");
  await expect(form.getByRole("button", { name: crm.save, exact: true })).toBeEnabled();
  await form.getByRole("button", { name: crm.save, exact: true }).click(); await expect(form).toHaveCount(0);
  expect((await checked(await page.request.get(`/api/crm/orders/${order.id}/payments`))).rows).toHaveLength(1);
  expect((await checked(await page.request.get(`/api/crm/orders/${order.id}`))).balanceMinor).toBe("134");
});
