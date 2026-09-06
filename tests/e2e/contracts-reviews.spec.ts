import { expect, test, type APIResponse } from "@playwright/test";
import { getB2bDictionary } from "../../src/lib/i18n/b2b-dictionary";
test.setTimeout(120_000);
async function checked(r: Pick<APIResponse, "ok" | "text" | "json">) {
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
test.beforeEach(async ({ page, baseURL }) => {
  await checked(
    await page.request.post("/api/auth/sign-in/email", {
      headers: { origin: baseURL! },
      data: {
        email: process.env["E2E_OWNER_EMAIL"],
        password: process.env["E2E_OWNER_PASSWORD"],
      },
    }),
  );
});
test("creates a Vietnamese contract with an R2 document and a manual review", async ({
  page,
  baseURL,
}) => {
  const copy = getB2bDictionary("vi"),
    headers = { origin: baseURL! },
    name = `B2B ${Date.now()}`;
  await checked(
    await page.request.post("/api/crm/companies", { headers, data: { name } }),
  );
  await page.goto("/vi/crm/contracts");
  const form = page.locator("form");
  await form.getByPlaceholder(copy.name).fill("Hợp đồng dịch vụ năm");
  await form.locator("select").first().selectOption({ label: name });
  await form.getByPlaceholder(copy.value).fill("1200000");
  await form.getByRole("button", { name: copy.create, exact: true }).click();
  const row = page.locator("tr").filter({ hasText: "Hợp đồng dịch vụ năm" });
  await expect(row).toContainText(copy.statuses.draft);
  await row.getByRole("combobox", { name: copy.status }).selectOption("active");
  await expect(row).toContainText(copy.statuses.active);
  await row.locator('input[type="file"]').setInputFiles({
    name: "hop-dong.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("private contract bytes"),
  });
  const contractId = await expect
    .poll(async () => {
      const list = await checked(
        await page.request.get("/api/crm/contracts", { headers }),
      );
      return list.rows.find((x: any) => x.name === "Hợp đồng dịch vụ năm")?.id;
    })
    .toBeTruthy();
  const list = await checked(
      await page.request.get("/api/crm/contracts", { headers }),
    ),
    saved = list.rows.find((x: any) => x.name === "Hợp đồng dịch vụ năm");
  await expect
    .poll(async () => {
      const detail = await checked(
        await page.request.get(`/api/crm/contracts/${saved.id}`, { headers }),
      );
      return detail.documents.map((x: any) => x.name);
    })
    .toContain("hop-dong.txt");
  await expect(row.getByRole("link", { name: "hop-dong.txt" })).toBeVisible();
  await row
    .getByRole("combobox", { name: copy.status })
    .selectOption("completed");
  await row.getByRole("button", { name: copy.archive }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: copy.showArchived }).click();
  const archivedRow = page
    .locator("tr")
    .filter({ hasText: "Hợp đồng dịch vụ năm" });
  await archivedRow.getByRole("button", { name: copy.restore }).click();
  await expect(archivedRow).toHaveCount(0);
  await page.goto("/vi/crm/reviews");
  const review = page.locator("form");
  await review
    .locator("select")
    .first()
    .selectOption({ label: `${copy.company}: ${name}` });
  await review.getByPlaceholder(copy.content).fill("Dịch vụ hỗ trợ rất tốt");
  await review.getByPlaceholder(copy.tags).fill("VIP, Hỗ trợ");
  await review.getByRole("button", { name: copy.create, exact: true }).click();
  await expect(
    page.getByText("Dịch vụ hỗ trợ rất tốt", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("hỗ trợ · vip", { exact: true })).toBeVisible();
  const reviewCard = page
    .locator("li")
    .filter({ hasText: "Dịch vụ hỗ trợ rất tốt" });
  await reviewCard.getByRole("button", { name: copy.archive }).click();
  await page.getByRole("button", { name: copy.showArchived }).click();
  const archivedReview = page
    .locator("li")
    .filter({ hasText: "Dịch vụ hỗ trợ rất tốt" });
  await expect(archivedReview).toBeVisible();
  await archivedReview.getByRole("button", { name: copy.restore }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("converts one lead to a contact, deal and linked draft order exactly once", async ({
  page,
  baseURL,
}) => {
  const headers = { origin: baseURL! },
    company = await checked(
      await page.request.post("/api/crm/companies", {
        headers,
        data: { name: `Conversion company ${Date.now()}` },
      }),
    ),
    owners = await checked(
      await page.request.get("/api/crm/owners", { headers }),
    ),
    owner = owners.rows[0],
    product = await checked(
      await page.request.post("/api/crm/products", {
        headers,
        data: {
          name: "Conversion service",
          kind: "service",
          initialVariant: {
            label: "Standard",
            priceMinor: 500000,
            currency: "VND",
          },
        },
      }),
    ),
    productDetail = await checked(
      await page.request.get(`/api/crm/products/${product.id}`, { headers }),
    ),
    variant = productDetail.variants[0],
    mapping = await checked(
      await page.request.get("/api/crm/lead-conversion-settings", { headers }),
    );
  await checked(
    await page.request.patch("/api/crm/lead-conversion-settings", {
      headers,
      data: {
        revision: mapping.revision,
        mappings: mapping.mappings,
        autoDeal: true,
        autoOrder: true,
      },
    }),
  );
  const lead = await checked(
      await page.request.post("/api/crm/leads", {
        headers,
        data: { firstName: "Converted buyer", companyId: company.id },
      }),
    ),
    deal = {
      name: "Converted opportunity",
      companyId: company.id,
      ownerMembershipId: owner.membershipId,
      stageId: "demo-booked",
      amountMinor: 900000,
      currency: "VND",
    },
    order = {
      name: "Converted order",
      currency: "VND",
      lines: [
        {
          variantId: variant.id,
          expectedVariantRevision: variant.revision,
          expectedProductRevision: productDetail.revision,
          quantity: 1,
          discountMinor: 0,
        },
      ],
      discountMinor: 0,
      surchargeMinor: 0,
      taxMinor: 0,
    },
    preview = await checked(
      await page.request.post(`/api/crm/leads/${lead.id}/conversion-preview`, {
        headers,
        data: {
          contact: { firstName: "Converted buyer", companyId: company.id },
          deal,
          order,
        },
      }),
    );
  expect(preview.errors).toEqual([]);
  const request = {
      operationKey: crypto.randomUUID(),
      expectedLeadRevision: preview.leadRevision,
      expectedLeadValueRevision: preview.leadValueRevision,
      expectedMappingRevision: preview.mappingRevision,
      expectedLeadFieldRevision: preview.leadFieldRevision,
      expectedContactFieldRevision: preview.contactFieldRevision,
      target: {
        mode: "create",
        contact: { firstName: "Converted buyer", companyId: company.id },
      },
      deal,
      order,
    },
    saved = await checked(
      await page.request.post(`/api/crm/leads/${lead.id}/convert`, {
        headers,
        data: request,
      }),
    ),
    retry = await checked(
      await page.request.post(`/api/crm/leads/${lead.id}/convert`, {
        headers,
        data: request,
      }),
    );
  expect(retry).toEqual(saved);
  const [dealDetail, orderDetail] = await Promise.all([
    checked(
      await page.request.get(`/api/crm/deals/${saved.dealId}`, { headers }),
    ),
    checked(
      await page.request.get(`/api/crm/orders/${saved.orderId}`, { headers }),
    ),
  ]);
  expect(dealDetail).toMatchObject({
    companyId: company.id,
    amountMinor: 900000,
  });
  expect(orderDetail).toMatchObject({
    contactId: saved.contactId,
    dealId: saved.dealId,
    state: "draft",
    originalMinor: 500000,
    collectedMinor: 0,
    refundedMinor: 0,
  });
  await page.goto(`/vi/crm/leads/${lead.id}`);
  await expect(page.getByText(/Đã chuyển đổi tiềm năng/)).toBeVisible();
});
