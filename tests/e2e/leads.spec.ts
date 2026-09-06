import { expect, test, type APIResponse } from "@playwright/test";
import { getCrmDictionary } from "../../src/lib/i18n/crm-dictionary";
import { getLeadDictionary } from "../../src/lib/i18n/lead-dictionary";
import type { FieldDefinition } from "../../src/lib/services/custom-fields/field-contracts";
test.setTimeout(90_000);
async function checked(response: Pick<APIResponse, "ok" | "text" | "json">) { expect(response.ok(), await response.text()).toBe(true); return response.json(); }

for (const locale of ["vi", "en"] as const) {
  test(`${locale}: lead required fields and private files survive conversion refresh and retry`, async ({ page, baseURL }) => {
    const crm = getCrmDictionary(locale), labels = getLeadDictionary(locale), headers = { origin: baseURL! };
    await checked(await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD } }));
    const name = `lead-${locale}-${crypto.randomUUID().slice(0, 8)}`, email = `${name}@example.invalid`;
    const duplicate = await checked(await page.request.post("/api/crm/contacts", { headers, data: { firstName: `${name}-existing`, email } }));
    const fields: FieldDefinition[] = [];
    try {
      for (const [entity, type] of [["lead", "text"], ["lead", "file"], ["contact", "file"]] as const) fields.push(await checked(await page.request.post("/api/crm/fields", { headers, data: { entity, type, label: `${name}-${entity}-${type}`, required: true } })));
      const [text, file, contactFile] = fields;
      await page.goto(`/${locale}/crm/leads`);
      await page.getByRole("button", { name: crm.add, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.locator("#record-firstName").fill(name);
      await dialog.locator("#record-email").fill(email);
      await expect(dialog.getByRole("heading", { name: labels.duplicates, exact: true })).toBeVisible();
      await expect(dialog.getByRole("link", { name: `${name}-existing`, exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: crm.save, exact: true }).click();
      expect(await dialog.locator(`#custom-${text!.id}`).evaluate(node => (node as HTMLInputElement).checkValidity())).toBe(false);
      await dialog.locator(`#custom-${text!.id}`).fill("Required lead value");
      const upload = page.waitForResponse(response => new URL(response.url()).pathname === "/api/crm/files" && response.request().method() === "POST");
      const bytes = Buffer.from("Original lead attachment"), filename = `${name}.txt`;
      await dialog.locator(`#custom-${file!.id}`).setInputFiles({ name: filename, mimeType: "text/plain", buffer: bytes });
      const sourceFile = await checked(await upload);
      const create = page.waitForResponse(response => new URL(response.url()).pathname === "/api/crm/leads" && response.request().method() === "POST");
      await dialog.getByRole("button", { name: crm.save, exact: true }).click();
      const lead = await checked(await create);
      await page.goto(`/${locale}/crm/leads?recordType=lead&recordId=${lead.id}`);
      await dialog.getByRole("button", { name: locale === "vi" ? "Thao tác" : "More actions", exact: true }).click();
      await page.getByRole("menuitem", { name: crm.edit, exact: true }).click();
      await dialog.locator("#record-title").fill("Edited before conversion");
      const edit = page.waitForResponse(response => new URL(response.url()).pathname === `/api/crm/leads/${lead.id}` && response.request().method() === "PATCH");
      await dialog.getByRole("button", { name: crm.save, exact: true }).click(); await checked(await edit);
      await dialog.getByRole("button", { name: labels.convert, exact: true }).click();
      await expect(dialog.locator("#record-firstName")).toHaveValue(name);
      await dialog.locator("#record-firstName").fill(`${name}-converted`);
      await dialog.locator("#record-email").fill(`${name}-new@example.invalid`);
      const targetUpload = page.waitForResponse(response => new URL(response.url()).pathname === "/api/crm/files" && response.request().method() === "POST");
      await dialog.locator(`#custom-${contactFile!.id}`).setInputFiles({ name: `${name}-contact.txt`, mimeType: "text/plain", buffer: Buffer.from("New contact attachment") });
      const targetFile = await checked(await targetUpload);
      const convertPath = `/api/crm/leads/${lead.id}/convert`;
      await page.route(`**${convertPath}`, route => route.abort("failed"));
      await dialog.getByRole("button", { name: crm.save, exact: true }).click();
      await expect(dialog.getByRole("button", { name: labels.retry, exact: true })).toBeVisible();
      await expect(dialog.locator("#record-firstName")).toHaveValue(`${name}-converted`);
      await dialog.getByRole("button", { name: labels.refresh, exact: true }).click();
      await expect(dialog.getByRole("button", { name: crm.save, exact: true })).toBeEnabled();
      await expect(dialog.locator("#record-firstName")).toHaveValue(`${name}-converted`);
      await expect(dialog.getByText(`${name}-contact.txt`, { exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: crm.save, exact: true }).click();
      await expect(dialog.getByRole("button", { name: labels.retry, exact: true })).toBeVisible();
      await page.unroute(`**${convertPath}`);
      const conversion = page.waitForResponse(response => new URL(response.url()).pathname === convertPath && response.request().method() === "POST");
      await dialog.getByRole("button", { name: labels.retry, exact: true }).click();
      const response = await conversion, request = response.request().postDataJSON(), result = await checked(response);
      expect(result.contactId).not.toBe(duplicate.id);
      expect(await checked(await page.request.post(convertPath, { headers, data: request }))).toEqual(result);
      await expect(dialog.getByText(labels.conversionSaved, { exact: false })).toBeVisible();
      expect((await checked(await page.request.get(`/api/crm/fields/values?entity=lead&recordId=${lead.id}`)))[file!.key]).toEqual([sourceFile.id]);
      expect((await checked(await page.request.get(`/api/crm/fields/values?entity=contact&recordId=${result.contactId}`)))[contactFile!.key]).toEqual([targetFile.id]);
      expect(await (await page.request.get(`/api/crm/files/${sourceFile.id}/download`)).body()).toEqual(bytes);
      await page.goto(`/${locale}/crm/contacts?recordType=contact&recordId=${result.contactId}`);
      await dialog.getByRole("link", { name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`recordId=${lead.id}`));
      await expect(dialog.getByText(labels.conversionSaved, { exact: false })).toBeVisible();
      expect(await (await page.request.get(`/api/crm/files/${sourceFile.id}/download`)).body()).toEqual(bytes);
      await page.setViewportSize({ width: 375, height: 812 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`${locale}-lead-history-mobile.png`), animations: "disabled" });
    } finally {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      for (const field of fields) await checked(await page.request.patch(`/api/crm/fields/${field.id}`, { headers, data: { action: "archive" } }));
    }
  });

  test(`${locale}: owner source/status/reason and mapping settings drive explicit linking`, async ({ page, baseURL }) => {
    const crm = getCrmDictionary(locale), labels = getLeadDictionary(locale), headers = { origin: baseURL! };
    await checked(await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD } }));
    const name = `catalog-${locale}-${crypto.randomUUID().slice(0, 8)}`;
    await page.goto(`/${locale}/crm/settings/leads`);
    await page.getByRole("textbox", { name: labels.label, exact: true }).fill(name);
    await page.getByRole("button", { name: crm.add, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(labels.settingsSaved);
    await page.getByRole("button", { name: labels.statuses, exact: true }).click();
    await page.getByRole("textbox", { name: labels.label, exact: true }).fill(`${name}-rejected`);
    await page.locator("#new-lead-status-meaning").click();
    await page.getByRole("option", { name: labels.rejected, exact: true }).click();
    await page.getByRole("checkbox", { name: labels.reason, exact: true }).first().check();
    await page.getByRole("button", { name: crm.add, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(labels.settingsSaved);
    const catalog = await checked(await page.request.get("/api/crm/lead-settings"));
    const source = catalog.sources.find((row: { label: string }) => row.label === name), status = catalog.statuses.find((row: { label: string }) => row.label === `${name}-rejected`);
    expect((await page.request.post("/api/crm/leads", { headers, data: { firstName: name, sourceId: source.id, statusId: status.id } })).status()).toBe(400);
    const lead = await checked(await page.request.post("/api/crm/leads", { headers, data: { firstName: name, sourceId: source.id, statusId: status.id, rejectionReason: "Explicit reason" } }));
    await page.goto(`/${locale}/crm/settings/lead-conversion`);
    await expect(page.getByRole("heading", { name: labels.mapping, exact: true })).toBeVisible();
    await page.getByRole("button", { name: crm.save, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(crm.saved);
    const contact = await checked(await page.request.post("/api/crm/contacts", { headers, data: { firstName: `${name}-target`, title: "Must remain unchanged" } }));
    const before = await checked(await page.request.get(`/api/crm/contacts/${contact.id}`));
    await page.goto(`/${locale}/crm/leads?recordType=lead&recordId=${lead.id}`);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: labels.convert, exact: true }).click();
    await dialog.getByRole("button", { name: labels.link, exact: true }).click();
    await dialog.getByRole("textbox", { name: labels.selectContact, exact: true }).fill(`${name}-target`);
    await dialog.getByRole("button", { name: new RegExp(`${name}-target`) }).click();
    const linked = page.waitForResponse(response => new URL(response.url()).pathname === `/api/crm/leads/${lead.id}/convert`);
    await dialog.getByRole("button", { name: labels.link, exact: true }).last().click();
    expect((await checked(await linked)).contactId).toBe(contact.id);
    const after = await checked(await page.request.get(`/api/crm/contacts/${contact.id}`));
    expect({ ...after, convertedFrom: before.convertedFrom }).toEqual(before);
    expect(after.convertedFrom).toEqual([expect.objectContaining({ id: lead.id })]);
    const modules = await checked(await page.request.get("/api/crm/modules")), current = modules.modules.find((row: { entity: string }) => row.entity === "lead");
    await checked(await page.request.patch("/api/crm/modules", { headers, data: { ...current, enabled: false } }));
    try {
      await page.reload();
      await expect(dialog.getByText(labels.conversionSaved, { exact: false })).toBeVisible();
      expect((await page.request.post("/api/crm/leads", { headers, data: { firstName: "Disabled write" } })).status()).toBe(403);
    } finally {
      const latest = await checked(await page.request.get("/api/crm/modules"));
      await checked(await page.request.patch("/api/crm/modules", { headers, data: { ...latest.modules.find((row: { entity: string }) => row.entity === "lead"), enabled: true } }));
    }
  });
}

test("member can read lead catalogs but cannot configure sources or mappings", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  await checked(await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_MEMBER_EMAIL, password: process.env.E2E_MEMBER_PASSWORD } }));
  const catalog = await checked(await page.request.get("/api/crm/lead-settings"));
  expect(catalog.canManage).toBe(false);
  expect((await page.request.patch("/api/crm/lead-settings", { headers, data: { action: "create", kind: "source", label: "Forbidden", revision: catalog.revision } })).status()).toBe(403);
  const mapping = await checked(await page.request.get("/api/crm/lead-conversion-settings"));
  expect((await page.request.patch("/api/crm/lead-conversion-settings", { headers, data: { revision: mapping.revision, mappings: mapping.mappings } })).status()).toBe(403);
  expect((await page.goto("/en/crm/settings/leads"))?.status()).toBe(404);
  expect((await page.goto("/en/crm/settings/lead-conversion"))?.status()).toBe(404);
});

test("lead conflict review preserves dirty edits and newer untouched server values", async ({ page, baseURL }) => {
  const crm = getCrmDictionary("en"), labels = getLeadDictionary("en"), headers = { origin: baseURL! };
  await checked(await page.request.post("/api/auth/sign-in/email", { headers, data: { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD } }));
  const name = `revision-${crypto.randomUUID().slice(0, 8)}`;
  const lead = await checked(await page.request.post("/api/crm/leads", { headers, data: { firstName: name, title: "Original title" } }));
  await page.goto(`/en/crm/leads?recordType=lead&recordId=${lead.id}`);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("menuitem", { name: crm.edit, exact: true }).click();
  await dialog.locator("#record-title").fill("Unsaved local title");
  const original = await checked(await page.request.get(`/api/crm/leads/${lead.id}`));
  await checked(await page.request.patch(`/api/crm/leads/${lead.id}`, { headers, data: { action: "update", data: { expectedRevision: original.revision, firstName: `${name}-server` } } }));
  const stale = page.waitForResponse(response => new URL(response.url()).pathname === `/api/crm/leads/${lead.id}` && response.request().method() === "PATCH");
  await dialog.getByRole("button", { name: crm.save, exact: true }).click();
  expect((await stale).status()).toBe(409);
  await expect(dialog.locator("#record-title")).toHaveValue("Unsaved local title");
  await dialog.getByRole("button", { name: labels.reviewCurrent, exact: true }).click();
  await dialog.getByRole("button", { name: labels.keepEdits, exact: true }).click();
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === `/api/crm/leads/${lead.id}` && response.request().method() === "PATCH");
  await dialog.getByRole("button", { name: crm.save, exact: true }).click();
  const response = await saved; await checked(response);
  expect(response.request().postDataJSON().data).toEqual(expect.objectContaining({ title: "Unsaved local title" }));
  expect(response.request().postDataJSON().data).not.toHaveProperty("firstName");
  const final = await checked(await page.request.get(`/api/crm/leads/${lead.id}`));
  expect(final.firstName).toBe(`${name}-server`); expect(final.title).toBe("Unsaved local title");
});
