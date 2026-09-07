import { expect, test, type APIResponse } from "@playwright/test";

async function checked(response: Pick<APIResponse, "ok" | "text" | "json">) {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test("owner operates webforms, app tokens, webhooks and private workspace settings", async ({
  page,
  baseURL,
}) => {
  const headers = { origin: baseURL! },
    suffix = Date.now().toString(36),
    runtime = process["env"];
  await checked(
    await page.request.post("/api/auth/sign-in/email", {
      headers,
      data: {
        email: runtime["E2E_OWNER_EMAIL"],
        password: runtime["E2E_OWNER_PASSWORD"],
      },
    }),
  );
  const owners = await checked(await page.request.get("/api/crm/owners")),
    ownerId = owners.rows.find(
      (row: { email: string }) => row.email === runtime["E2E_OWNER_EMAIL"],
    ).membershipId;
  await page.goto("/vi/crm/settings/operations");
  await expect(
    page.getByRole("heading", { name: "Tích hợp và vận hành", exact: true }),
  ).toBeVisible();
  await page.getByPlaceholder("Tên form").fill(`Form ${suffix}`);
  await page.getByPlaceholder("website-leads").fill(`leads-${suffix}`);
  await page.getByRole("button", { name: "Tạo form", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã tạo webform.");
  const invalid = await page.request.post(
    `/api/public/webforms/leads-${suffix}`,
    {
      headers: {
        "idempotency-key": `submission-${suffix}`,
        "cf-connecting-ip": "203.0.113.8",
      },
      data: { given: "Browser lead" },
    },
  );
  expect(invalid.status()).toBe(400);
  await page.goto("/vi/crm/settings/account");
  await expect(
    page.getByRole("heading", { name: "Tài khoản và API", exact: true }),
  ).toBeVisible();
  await page.getByPlaceholder("Ví dụ: Website bán hàng").fill(`App ${suffix}`);
  await page.getByRole("checkbox", { name: /Đọc liên hệ/ }).check();
  await page.getByRole("button", { name: "Tạo key", exact: true }).click();
  const shownKey = page.locator("code").filter({ hasText: /^[0-9a-f]{32}$/ });
  await expect(shownKey).toBeVisible();
  const initialKey = await shownKey.textContent();
  expect(initialKey).toMatch(/^[0-9a-f]{32}$/);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(baseURL!).origin,
  });
  await page.getByRole("button", { name: "Sao chép key", exact: true }).click();
  await expect(page.getByText("Đã sao chép.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.locator("code").filter({ hasText: /^[0-9a-f]{32}$/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: `Xoay: App ${suffix}`, exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Xoay và vô hiệu key cũ",
      exact: true,
    })
    .click();
  const rotatedKey = await page
    .locator("code")
    .filter({ hasText: /^[0-9a-f]{32}$/ })
    .textContent();
  expect(rotatedKey).toMatch(/^[0-9a-f]{32}$/);
  expect(rotatedKey).not.toBe(initialKey);
  expect(
    (
      await page.request.get("/api/integrations/v1/contacts", {
        headers: { authorization: `Bearer ${initialKey}` },
      })
    ).status(),
  ).toBe(401);
  await page
    .getByRole("button", { name: "Đã lưu, đóng", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Thu hồi: App ${suffix}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Thu hồi key", exact: true })
    .click();
  expect(
    (
      await page.request.get("/api/integrations/v1/contacts", {
        headers: { authorization: `Bearer ${rotatedKey}` },
      })
    ).status(),
  ).toBe(401);
  const keys = await checked(await page.request.get("/api/crm/api-keys"));
  expect(
    keys.find((item: { name: string }) => item.name === `App ${suffix}`).status,
  ).toBe("revoked");
  const operational = await checked(
      await page.request.post("/api/crm/api-keys", {
        headers,
        data: {
          action: "create-app",
          data: {
            name: `Operational ${suffix}`,
            grants: [
              "contacts.read",
              "leads.read",
              "leads.create",
              "tickets.create",
            ],
          },
        },
      }),
    ),
    appHeaders = { authorization: `Bearer ${operational.token}` };
  expect(operational.token).toMatch(/^[0-9a-f]{32}$/);
  expect(
    (
      await page.request.get("/api/integrations/leads?limit=nope", {
        headers: appHeaders,
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/integrations/leads", {
        headers: { ...appHeaders, "content-type": "application/json" },
        data: "{",
      })
    ).status(),
  ).toBe(400);
  const appLead = await checked(
    await page.request.post("/api/integrations/v1/leads", {
      headers: appHeaders,
      data: {
        operationKey: `lead-${suffix}`,
        firstName: "API lead",
        sourceId: "manual",
      },
    }),
  );
  expect(
    (
      await checked(
        await page.request.get("/api/integrations/v1/leads", {
          headers: appHeaders,
        }),
      )
    ).rows.some((row: { id: string }) => row.id === appLead.id),
  ).toBe(true);
  expect(
    (
      await checked(
        await page.request.get("/api/integrations/v1/contacts", {
          headers: appHeaders,
        }),
      )
    ).rows,
  ).toEqual([]);
  expect(
    (
      await checked(
        await page.request.get("/api/integrations/contacts", {
          headers: appHeaders,
        }),
      )
    ).rows,
  ).toEqual([]);
  await checked(
    await page.request.post("/api/integrations/v1/tickets", {
      headers: appHeaders,
      data: {
        operationKey: `ticket-${suffix}`,
        subject: "API ticket",
        source: "api",
      },
    }),
  );
  const operationalRow = (
    await checked(await page.request.get("/api/crm/api-keys"))
  ).find((item: { id: string }) => item.id === operational.id);
  await checked(
    await page.request.post("/api/crm/api-keys", {
      headers,
      data: {
        action: "revoke-app",
        id: operational.id,
        revision: operationalRow.revision,
      },
    }),
  );
  expect(
    (
      await page.request.get("/api/integrations/v1/leads", {
        headers: appHeaders,
      })
    ).status(),
  ).toBe(401);
  const endpoint = await checked(
    await page.request.post("/api/crm/integrations", {
      headers,
      data: {
        action: "create-endpoint",
        data: {
          name: `Hook ${suffix}`,
          url: "https://receiver.invalid/hooks",
          events: ["lead.created"],
        },
      },
    }),
  );
  const refreshed = await checked(
      await page.request.get("/api/crm/integrations"),
    ),
    endpointRow = refreshed.endpoints.find(
      (item: { id: string }) => item.id === endpoint.id,
    );
  await checked(
    await page.request.post("/api/crm/integrations", {
      headers,
      data: {
        action: "disable-endpoint",
        id: endpoint.id,
        revision: endpointRow.revision,
      },
    }),
  );
  await checked(
    await page.request.post("/api/crm/integrations", {
      headers,
      data: {
        action: "create-automation",
        data: {
          name: `Assign ${suffix}`,
          eventType: "lead.received",
          condition: { field: "source", equals: "website" },
          action: {
            type: "set-lead-owner",
            leadIdField: "leadId",
            membershipId: ownerId,
          },
          enabled: true,
          maxDepth: 3,
        },
      },
    }),
  );
  const workspace = await checked(await page.request.get("/api/crm/workspace"));
  expect(workspace.deletionImpact).toBeTruthy();
  expect(workspace.profile.hasLogo).toBe(false);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Swagger exposes only the approved API and Try it out sends the workspace key", async ({
  page,
  baseURL,
}) => {
  const headers = { origin: baseURL! },
    runtime = process["env"],
    suffix = Date.now().toString(36);
  await checked(
    await page.request.post("/api/auth/sign-in/email", {
      headers,
      data: {
        email: runtime["E2E_OWNER_EMAIL"],
        password: runtime["E2E_OWNER_PASSWORD"],
      },
    }),
  );
  const created = await checked(
    await page.request.post("/api/crm/api-keys", {
      headers,
      data: {
        action: "create-app",
        data: { name: `Swagger ${suffix}`, grants: ["contacts.read"] },
      },
    }),
  );
  const document = await checked(await page.request.get("/api/openapi.json"));
  expect(Object.keys(document.paths).sort()).toEqual(
    [
      "/api/integrations/v1/contacts",
      "/api/integrations/v1/events",
      "/api/integrations/v1/leads",
      "/api/integrations/v1/tickets",
      "/api/public/webforms/{slug}",
    ].sort(),
  );
  expect(JSON.stringify(document.paths)).not.toContain("/api/crm/");
  await page.goto("/api-docs");
  await expect(
    page.getByRole("heading", { name: /^CRM Integration API 1\.0\.0/ }),
  ).toBeVisible();
  await page.locator("button.authorize").click();
  const dialog = page
    .locator(".auth-container")
    .filter({ hasText: "integrationBearer" });
  await dialog
    .getByRole("textbox", { name: "auth-bearer-value" })
    .fill(created.token);
  await dialog
    .getByRole("button", { name: "Apply credentials", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .click();
  const operation = page
    .locator(".opblock-get")
    .filter({ hasText: "/api/integrations/v1/contacts" });
  await operation.locator(".opblock-summary").click();
  await expect(
    operation.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeVisible();
  await operation.getByRole("button", { name: "Execute", exact: true }).click();
  await expect(
    operation.locator(".response-col_status").filter({ hasText: "200" }),
  ).toBeVisible();
});
