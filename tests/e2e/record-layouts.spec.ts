import { expect, test, type APIResponse } from "@playwright/test";
import { getCrmDictionary } from "../../src/lib/i18n/crm-dictionary";
import { getLayoutDictionary } from "../../src/lib/i18n/layout-dictionary";
import type { LayoutSettings } from "../../src/lib/services/layouts/layout-contracts";
import type { FieldDefinition } from "../../src/lib/services/custom-fields/field-contracts";

async function checked(response: Pick<APIResponse, "ok" | "text" | "json">) { expect(response.ok(), await response.text()).toBe(true); return response.json(); }
for (const locale of ["vi", "en"] as const) {
  test(`${locale}: layout controls real forms, atomic required files and historical edits`, async ({ page, baseURL }) => {
    const crm = getCrmDictionary(locale), labels = getLayoutDictionary(locale), headers = { origin: baseURL! };
    await checked(await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD } }));
    const read = async () => await checked(await page.request.get("/api/crm/layouts?entity=company")) as LayoutSettings;
    const original = await read(); const prefix = `layout-${locale}-${crypto.randomUUID().slice(0, 8)}`;
    const historical = await checked(await page.request.post("/api/crm/companies", { headers, data: { name: `${prefix}-old`, domain: `${prefix}.example` } }));
    const text = await checked(await page.request.post("/api/crm/fields", { headers, data: { entity: "company", label: `${prefix}-required`, type: "text", required: true } })) as FieldDefinition;
    const file = await checked(await page.request.post("/api/crm/fields", { headers, data: { entity: "company", label: `${prefix}-file`, type: "file", required: true } })) as FieldDefinition;
    try {
      await page.goto(`/${locale}/crm/settings/layouts`);
      await expect(page.getByRole("heading", { name: labels.title, exact: true })).toBeVisible();
      const nameRow = page.locator('[data-layout-field="builtin:name"]');
      const domainRow = page.locator('[data-layout-field="builtin:domain"]');
      const movedRow = page.locator(`[data-layout-field="custom:${text.key}"]`);
      await expect(nameRow.getByRole("checkbox")).toBeDisabled();
      await expect(page.locator(`[data-layout-field="custom:${text.key}"]`).getByRole("checkbox")).toBeDisabled();
      const initial = await read();
      await domainRow.getByRole("checkbox").uncheck();
      await page.getByRole("button", { name: labels.cancel, exact: true }).click();
      await expect(domainRow.getByRole("checkbox")).toBeChecked();
      expect((await read()).revision).toBe(initial.revision);
      await domainRow.getByRole("checkbox").uncheck();
      while ((await page.locator('[data-layout-field]').first().getAttribute('data-layout-field')) !== `custom:${text.key}`) {
        await movedRow.getByRole("button", { name: `${labels.up}: ${text.label}`, exact: true }).click();
      }
      await page.getByRole("button", { name: crm.save, exact: true }).click();
      await expect(page.getByRole("status")).toHaveText(labels.saved);
      const saved = await read(); expect(saved.fields[0]?.key).toBe(text.key);
      expect(saved.fields.find(entry => entry.kind === "builtin" && entry.key === "domain")?.visible).toBe(false);
      await page.getByRole("button", { name: crm.contact, exact: true }).click();
      await page.getByRole("button", { name: crm.company, exact: true }).click();
      await expect(domainRow.getByRole("checkbox")).not.toBeChecked();
      await expect(page.locator("[data-layout-field]").first()).toHaveAttribute("data-layout-field", `custom:${text.key}`);
      await page.setViewportSize({ width: 375, height: 812 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`${locale}-record-layout-mobile.png`), animations: "disabled" });
      // A second real write invalidates the open owner's revision.
      await checked(await page.request.patch("/api/crm/layouts", { headers, data: { entity: "company", revision: saved.revision, fields: saved.fields.map(({ kind, key, visible }) => ({ kind, key, visible })) } }));
      await page.getByRole("button", { name: crm.save, exact: true }).click();
      await expect(page.getByRole("alert")).toHaveText(labels.conflict);
      await expect(page.getByRole("button", { name: crm.save, exact: true })).toBeDisabled();
      await page.getByRole("button", { name: labels.reload, exact: true }).click();
      await expect(page.getByRole("button", { name: crm.save, exact: true })).toBeEnabled();

      await page.goto(`/${locale}/crm/companies?q=${prefix}`);
      await page.getByRole("button", { name: crm.add, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator("#record-name")).toBeVisible();
      await expect(dialog.locator("#record-domain")).toHaveCount(0);
      expect(await dialog.locator(`#custom-${text.id}`).evaluate(node => Boolean(node.compareDocumentPosition(document.querySelector('#record-name')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
      await dialog.locator("#record-name").fill(`${prefix}-new`);
      await dialog.getByRole("button", { name: crm.save, exact: true }).click();
      expect(await dialog.locator(`#custom-${text.id}`).evaluate(node => (node as HTMLInputElement).checkValidity())).toBe(false);
      await dialog.locator(`#custom-${text.id}`).fill("Created atomically");
      const uploadResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/crm/files" && response.request().method() === "POST");
      const bytes = Buffer.from(`Real private creation file ${locale}`), filename = `${prefix}.txt`;
      await dialog.locator(`#custom-${file.id}`).setInputFiles({ name: filename, mimeType: "text/plain", buffer: bytes });
      const uploadedResponse = await uploadResponse; const uploaded = await checked(uploadedResponse);
      const draftId = new URL(uploadedResponse.url()).searchParams.get("draftId")!; expect(draftId).toBeTruthy();
      expect((await page.request.get(`/api/crm/companies/${draftId}`)).status()).toBe(404);
      const listedBefore = await checked(await page.request.get(`/api/crm/companies?q=${prefix}-new`)); expect(listedBefore.rows).toHaveLength(0);
      const createdResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/crm/companies" && response.request().method() === "POST");
      await dialog.getByRole("button", { name: crm.save, exact: true }).click();
      const created = await checked(await createdResponse); expect(created.id).toBe(draftId);
      const values = await checked(await page.request.get(`/api/crm/fields/values?entity=company&recordId=${created.id}`));
      expect(values[text.key]).toBe("Created atomically"); expect(values[file.key]).toEqual([uploaded.id]);
      const download = await page.request.get(`/api/crm/files/${uploaded.id}/download`); expect(download.ok()).toBe(true); expect(await download.body()).toEqual(bytes);

      // Existing incomplete records remain editable without filling historical blanks.
      await page.goto(`/${locale}/crm/companies?q=${prefix}&recordType=company&recordId=${historical.id}`);
      await dialog.getByRole("button", { name: locale === "vi" ? "Thao tác" : "More actions", exact: true }).click();
      await page.getByRole("menuitem", { name: crm.edit, exact: true }).click();
      await expect(dialog.locator("#record-domain")).toHaveCount(0);
      await expect(dialog.locator(`#custom-${text.id}`)).toBeVisible();
      expect(await dialog.locator(`#custom-${text.id}`).evaluate(node => (node as HTMLInputElement).required)).toBe(false);
      await dialog.locator("#record-name").fill(`${prefix}-renamed`);
      const editedResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/crm/companies/${historical.id}` && response.request().method() === "PATCH");
      await dialog.getByRole("button", { name: crm.save, exact: true }).click();
      const edited = await checked(await editedResponse); expect(edited.domain).toBe(`${prefix}.example`); expect(edited.name).toBe(`${prefix}-renamed`);
      const cleared = await page.request.patch(`/api/crm/companies/${created.id}`, { headers, data: { action: "update", data: { customFields: { [text.key]: null } } } });
      expect(cleared.status()).toBe(400);
      expect((await checked(await page.request.get(`/api/crm/fields/values?entity=company&recordId=${created.id}`)))[text.key]).toBe("Created atomically");
    } finally {
      for (const field of [text, file]) await checked(await page.request.patch(`/api/crm/fields/${field.id}`, { headers, data: { action: "archive" } }));
      const latest = await read();
      await checked(await page.request.patch("/api/crm/layouts", { headers, data: { entity: "company", revision: latest.revision, fields: original.fields.map(({ kind, key, visible }) => ({ kind, key, visible })) } }));
    }
  });
}

test("member sees layouts but cannot change their configuration", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! }; const labels = getCrmDictionary("en");
  await checked(await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_MEMBER_EMAIL, password: process.env.E2E_MEMBER_PASSWORD } }));
  const settings = await checked(await page.request.get("/api/crm/layouts?entity=company")) as LayoutSettings;
  expect(settings.canManage).toBe(false);
  expect((await page.request.patch("/api/crm/layouts", { headers, data: { entity: "company", revision: settings.revision, fields: settings.fields.map(({ key, kind, visible }) => ({ key, kind, visible })) } })).status()).toBe(403);
  const response = await page.goto("/en/crm/settings/layouts");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("button", { name: labels.save, exact: true })).toHaveCount(0);
});

test("calendar conflict and failed layout refresh preserve editing drafts", async ({ page, baseURL }) => {
  const labels = getCrmDictionary("en"), headers = { origin: baseURL! };
  await checked(await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD } }));
  const original = await checked(await page.request.get("/api/crm/settings"));
  const name = `refresh-${crypto.randomUUID().slice(0, 8)}`;
  const date = await checked(await page.request.post("/api/crm/fields", { headers, data: { entity: "company", type: "date", label: name, config: { dateTime: true } } })) as FieldDefinition;
  try {
    await checked(await page.request.patch("/api/crm/settings", { headers, data: { timeZone: "UTC", countryCode: original.countryCode, revision: original.revision } }));
    const company = await checked(await page.request.post("/api/crm/companies", { headers, data: { name } }));
    await page.goto(`/en/crm/companies?q=${name}&recordType=company&recordId=${company.id}`);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "More actions", exact: true }).click();
    await page.getByRole("menuitem", { name: labels.edit, exact: true }).click();
    await dialog.locator("#record-name").fill(`${name}-draft`);
    const input = dialog.locator(`#custom-${date.id}`);
    await input.fill("2030-06-01T10:30:00.123");
    const calendar = await checked(await page.request.get("/api/crm/settings"));
    await checked(await page.request.patch("/api/crm/settings", { headers, data: { timeZone: "Asia/Ho_Chi_Minh", countryCode: calendar.countryCode, revision: calendar.revision } }));
    await dialog.getByRole("button", { name: labels.save, exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(labels.custom.calendarStale);
    await page.route("**/api/crm/layouts?entity=company", route => route.abort("failed"));
    await dialog.getByRole("button", { name: labels.custom.reloadFields, exact: true }).click();
    await expect(dialog.getByRole("button", { name: labels.retry, exact: true })).toBeVisible();
    await expect(dialog.locator("#record-name")).toHaveValue(`${name}-draft`);
    await expect(input).toHaveValue("2030-06-01T10:30:00.123");
    await expect(dialog.getByRole("button", { name: labels.save, exact: true })).toBeDisabled();
    await page.unroute("**/api/crm/layouts?entity=company");
    await dialog.getByRole("button", { name: labels.retry, exact: true }).click();
    await expect(dialog.getByRole("button", { name: labels.save, exact: true })).toBeEnabled();
    await expect(dialog.locator("#record-name")).toHaveValue(`${name}-draft`);
    const response = page.waitForResponse(item => new URL(item.url()).pathname === `/api/crm/companies/${company.id}` && item.request().method() === "PATCH");
    await dialog.getByRole("button", { name: labels.save, exact: true }).click();
    expect((await checked(await response)).name).toBe(`${name}-draft`);
    expect((await checked(await page.request.get(`/api/crm/fields/values?entity=company&recordId=${company.id}`)))[date.key]).toBe("2030-06-01T10:30:00.123Z");
  } finally {
    await page.unroute("**/api/crm/layouts?entity=company");
    await checked(await page.request.patch(`/api/crm/fields/${date.id}`, { headers, data: { action: "archive" } }));
    const latest = await checked(await page.request.get("/api/crm/settings"));
    await checked(await page.request.patch("/api/crm/settings", { headers, data: { timeZone: original.timeZone, countryCode: original.countryCode, revision: latest.revision } }));
  }
});
