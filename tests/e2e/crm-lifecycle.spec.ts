import { expect, request as createRequest, test, type APIResponse } from "@playwright/test";

test.setTimeout(120_000);

async function checked(response: Pick<APIResponse, "ok" | "text" | "json">) {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test("owner completes the CRM lifecycle while module and membership guards stay live", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  await checked(await page.request.post("/api/auth/sign-in/email", {
    headers,
    data: { email: process["env"]["E2E_OWNER_EMAIL"], password: process["env"]["E2E_OWNER_PASSWORD"] },
  }));

  const suffix = crypto.randomUUID().slice(0, 8);
  const owners = await checked(await page.request.get("/api/crm/owners", { headers }));
  const owner = owners.rows.find((row: { email: string }) => row.email === process["env"]["E2E_OWNER_EMAIL"]);
  const company = await checked(await page.request.post("/api/crm/companies", {
    headers,
    data: { name: `Acceptance company ${suffix}` },
  }));
  const product = await checked(await page.request.post("/api/crm/products", {
    headers,
    data: {
      name: `Acceptance service ${suffix}`,
      kind: "service",
      initialVariant: { label: "Standard", priceMinor: 500000, costMinor: 300000, currency: "VND" },
    },
  }));
  const productDetail = await checked(await page.request.get(`/api/crm/products/${product.id}`, { headers }));
  const variant = productDetail.variants[0];
  const mapping = await checked(await page.request.get("/api/crm/lead-conversion-settings", { headers }));
  await checked(await page.request.patch("/api/crm/lead-conversion-settings", {
    headers,
    data: { revision: mapping.revision, mappings: mapping.mappings, autoDeal: true, autoOrder: true },
  }));

  const lead = await checked(await page.request.post("/api/crm/leads", {
    headers,
    data: { firstName: `Acceptance ${suffix}`, lastName: "Buyer", companyId: company.id },
  }));
  const dealInput = {
    name: `Acceptance opportunity ${suffix}`,
    companyId: company.id,
    ownerMembershipId: owner.membershipId,
    stageId: "demo-booked",
    amountMinor: 900000,
    currency: "VND",
  };
  const orderInput = {
    name: `Acceptance order ${suffix}`,
    currency: "VND",
    lines: [{
      variantId: variant.id,
      expectedVariantRevision: variant.revision,
      expectedProductRevision: productDetail.revision,
      quantity: 1,
      discountMinor: 0,
    }],
    discountMinor: 0,
    surchargeMinor: 0,
    taxMinor: 0,
  };
  const preview = await checked(await page.request.post(`/api/crm/leads/${lead.id}/conversion-preview`, {
    headers,
    data: { contact: { firstName: `Acceptance ${suffix}`, lastName: "Buyer", companyId: company.id }, deal: dealInput, order: orderInput },
  }));
  expect(preview.errors).toEqual([]);
  const conversionRequest = {
    operationKey: crypto.randomUUID(),
    expectedLeadRevision: preview.leadRevision,
    expectedLeadValueRevision: preview.leadValueRevision,
    expectedMappingRevision: preview.mappingRevision,
    expectedLeadFieldRevision: preview.leadFieldRevision,
    expectedContactFieldRevision: preview.contactFieldRevision,
    target: { mode: "create", contact: { firstName: `Acceptance ${suffix}`, lastName: "Buyer", companyId: company.id } },
    deal: dealInput,
    order: orderInput,
  };
  const conversion = await checked(await page.request.post(`/api/crm/leads/${lead.id}/convert`, { headers, data: conversionRequest }));
  expect(await checked(await page.request.post(`/api/crm/leads/${lead.id}/convert`, { headers, data: conversionRequest }))).toEqual(conversion);

  const settings = await checked(await page.request.get("/api/crm/settings", { headers }));
  let order = await checked(await page.request.get(`/api/crm/orders/${conversion.orderId}`, { headers }));
  for (const action of ["confirm", "complete"] as const) {
    const result = await checked(await page.request.post(`/api/crm/orders/${order.id}/commands`, {
      headers,
      data: { action, expectedRevision: order.revision, calendarRevision: settings.revision, operationKey: crypto.randomUUID(), reason: `Acceptance ${action}` },
    }));
    order = { ...order, revision: result.revision, state: result.state };
  }
  let payment = await checked(await page.request.post(`/api/crm/orders/${order.id}/payments`, {
    headers,
    data: { kind: "collection", amountMinor: 500000, method: "Bank transfer", expectedRevision: order.revision, calendarRevision: settings.revision, operationKey: crypto.randomUUID(), reason: "Acceptance collection" },
  }));
  payment = await checked(await page.request.post(`/api/crm/orders/${order.id}/payments`, {
    headers,
    data: { kind: "refund", amountMinor: 100000, method: "Bank transfer", expectedRevision: payment.revision, calendarRevision: settings.revision, operationKey: crypto.randomUUID(), reason: "Acceptance refund" },
  }));
  order = await checked(await page.request.get(`/api/crm/orders/${order.id}`, { headers }));
  expect(order).toMatchObject({ state: "completed", collectedMinor: 500000, refundedMinor: 100000, balanceMinor: "100000" });
  expect((await checked(await page.request.get(`/api/crm/orders/${order.id}/payments`, { headers }))).rows).toHaveLength(2);

  let contract = await checked(await page.request.post("/api/crm/contracts", {
    headers,
    data: {
      operationKey: crypto.randomUUID(),
      name: `Acceptance contract ${suffix}`,
      companyId: company.id,
      contactId: conversion.contactId,
      dealId: conversion.dealId,
      orderId: conversion.orderId,
      valueMinor: 500000,
      currency: "VND",
      ownerMembershipId: owner.membershipId,
      parties: [{ companyId: company.id, role: "Customer" }],
    },
  }));
  contract = await checked(await page.request.patch(`/api/crm/contracts/${contract.id}`, {
    headers,
    data: { action: "status", status: "active", expectedRevision: contract.revision, operationKey: crypto.randomUUID(), reason: "Acceptance activation" },
  }));
  expect(contract).toMatchObject({ status: "active", contactId: conversion.contactId, orderId: conversion.orderId });

  const startsAt = new Date(Date.now() + 86_400_000).toISOString();
  const endsAt = new Date(Date.now() + 90_000_000).toISOString();
  const [appointment, task, ticket] = await Promise.all([
    checked(await page.request.post("/api/crm/appointments", { headers, data: { operationKey: crypto.randomUUID(), calendarRevision: settings.revision, subject: `Acceptance appointment ${suffix}`, startsAt, endsAt, contactId: conversion.contactId, companyId: company.id, organizerMembershipId: owner.membershipId, participantMembershipIds: [], reminderEnabled: true, reminderOffsetMinutes: 15, acknowledgeConflict: false } })),
    checked(await page.request.post("/api/crm/tasks", { headers, data: { subject: `Acceptance task ${suffix}`, contactId: conversion.contactId, dueAt: startsAt, assigneeMembershipId: owner.membershipId } })),
    checked(await page.request.post("/api/crm/tickets", { headers, data: { operationKey: crypto.randomUUID(), subject: `Acceptance ticket ${suffix}`, priority: "normal", source: "manual", contactId: conversion.contactId, companyId: company.id, assigneeMembershipId: owner.membershipId, collaboratorMembershipIds: [], dueAt: endsAt } })),
  ]);
  expect([appointment.id, task.id, ticket.id]).toEqual([expect.any(String), expect.any(String), expect.any(String)]);

  const year = new Date().getUTCFullYear();
  const reportQuery = `from=${year}-01-01&to=${year}-12-31&scope=everyone`;
  const report = await checked(await page.request.get(`/api/crm/reports?${reportQuery}`, { headers }));
  expect(report).toEqual(expect.objectContaining({ orders: expect.anything() }));
  const exported = await page.request.get(`/api/crm/reports/export?${reportQuery}`, { headers });
  expect(exported.ok(), await exported.text()).toBe(true);
  expect(exported.headers()["content-type"]).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  let modules = await checked(await page.request.get("/api/crm/modules", { headers }));
  const leadModule = modules.modules.find((row: { entity: string }) => row.entity === "lead");
  await checked(await page.request.patch("/api/crm/modules", { headers, data: { ...leadModule, enabled: false } }));
  try {
    expect((await page.request.get(`/api/crm/leads/${lead.id}`, { headers })).status()).toBe(200);
    expect((await page.request.post("/api/crm/leads", { headers, data: { firstName: "Blocked while disabled" } })).status()).toBe(403);
  } finally {
    modules = await checked(await page.request.get("/api/crm/modules", { headers }));
    await checked(await page.request.patch("/api/crm/modules", { headers, data: { ...modules.modules.find((row: { entity: string }) => row.entity === "lead"), enabled: true } }));
  }

  const disposable = await createRequest.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: headers });
  try {
    await checked(await disposable.post("/api/auth/sign-in/email", { data: { email: process["env"]["E2E_DISPOSABLE_MEMBER_EMAIL"], password: process["env"]["E2E_DISPOSABLE_MEMBER_PASSWORD"] } }));
    const session = await checked(await disposable.get("/api/auth/get-session"));
    expect((await disposable.get("/api/crm/companies")).status()).toBe(200);
    await checked(await page.request.delete(`/api/crm/members/${session.user.id}`, { headers, data: {} }));
    expect((await disposable.get("/api/crm/companies")).status()).toBe(401);
  } finally {
    await disposable.dispose();
  }
});
