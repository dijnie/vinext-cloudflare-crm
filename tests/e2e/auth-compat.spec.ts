import { expect, request as createRequest, test } from "@playwright/test";

function requiredEnvironment(name: string): string {
  const value = process["env"][name];
  if (!value) throw new Error(`${name} is required for preview E2E`);
  return value;
}

test("preview guards legacy routes and preserves company sheet history", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("E2E_BASE_URL is required for preview E2E");
  const email = requiredEnvironment("E2E_EMAIL");
  const password = requiredEnvironment("E2E_PASSWORD");
  const companyName = requiredEnvironment("E2E_COMPANY_NAME");
  const api = await createRequest.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { origin: baseURL },
  });

  const denied = await api.post("/api/auth/sign-up/email", {
    data: {
      name: "Denied",
      email: "definitely-not-allowed@example.invalid",
      password: "not-a-real-user-password",
    },
  });
  expect(denied.status()).toBe(400);

  const signIn = await api.post("/api/auth/sign-in/email", {
    data: { email, password },
  });
  expect(signIn.ok()).toBe(true);
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: await api.storageState(),
  });
  const page = await context.newPage();

  await page.goto("/vi/crm/companies");
  await expect(page.getByRole("heading", { name: "Công ty" })).toBeVisible();
  const company = page.getByText(companyName, { exact: true }).first();
  await expect(company).toBeVisible();
  await company
    .locator("..")
    .getByRole("button", { name: "Mở chi tiết" })
    .click();
  await expect(page).toHaveURL(/\?record=/);
  await expect(
    page.getByRole("dialog", { name: companyName }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).not.toHaveURL(/\?record=/);
  await page.goForward();
  await expect(page).toHaveURL(/\?record=/);

  expect((await api.get("/admin")).status()).toBe(404);
  expect((await api.get("/api/customers")).status()).toBe(404);
  await context.close();
  await api.dispose();
});
