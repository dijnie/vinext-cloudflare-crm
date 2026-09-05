import { expect, request, test } from "@playwright/test";

const legacyRoutes = [
  "/admin",
  "/admin/customers",
  "/admin/customers/1",
  "/admin/subscriptions",
  "/admin/subscriptions/1",
  "/api/customers",
  "/api/customers/1",
  "/api/subscriptions",
  "/api/subscriptions/1",
  "/api/customer_subscriptions",
  "/api/customers/1/workflow",
];

test("malformed signup is rejected before creating an account", async ({ request: api, baseURL }) => {
  const response = await api.post("/api/auth/sign-up/email", {
    headers: { origin: baseURL! },
    data: { name: "Malformed", email: "not-an-email", password: "not-a-real-user-password" },
  });
  expect(response.status()).toBe(400);
});

for (const authenticated of [false, true]) {
  test(`${authenticated ? "authenticated" : "unauthenticated"}: removed sample and workflow routes return secured 404s`, async ({ baseURL }) => {
    const api = await request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: { origin: baseURL! },
    });
    try {
      if (authenticated) {
        const signedIn = await api.post("/api/auth/sign-in/email", {
          data: { email: process.env["E2E_OWNER_EMAIL"], password: process.env["E2E_OWNER_PASSWORD"] },
        });
        expect(signedIn.ok()).toBe(true);
        expect((await api.get("/api/crm/members")).status()).toBe(200);
      } else {
        expect((await api.get("/api/crm/members")).status()).toBe(401);
      }
      for (const path of legacyRoutes) {
        for (const method of ["GET", "POST"]) {
          const response = await api.fetch(path, { method, maxRedirects: 0 });
          expect(response.status(), `${method} ${path}`).toBe(404);
          expect(response.headers()).toMatchObject({
            "permissions-policy": "camera=(), microphone=(), geolocation=()",
            "referrer-policy": "strict-origin-when-cross-origin",
            "strict-transport-security": "max-age=31536000; includeSubDomains",
            "x-content-type-options": "nosniff",
            "x-frame-options": "DENY",
          });
          expect(response.headers()["content-security-policy"]).toContain("default-src 'self'");
          expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
          expect(response.headers()["www-authenticate"]).toBeUndefined();
          expect(await response.text()).toBe("");
        }
      }
    } finally {
      await api.dispose();
    }
  });
}
