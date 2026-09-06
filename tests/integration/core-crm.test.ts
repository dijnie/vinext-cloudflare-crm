import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createCompaniesGetHandler,
  createCompaniesPatchHandler,
  createCompaniesPostHandler,
} from "../../src/app/api/crm/companies/route";
import {
  createCompanyGetHandler,
  createCompanyPatchHandler,
} from "../../src/app/api/crm/companies/[companyId]/route";
import {
  createContactsGetHandler,
  createContactsPatchHandler,
  createContactsPostHandler,
} from "../../src/app/api/crm/contacts/route";
import {
  createContactGetHandler,
  createContactPatchHandler,
} from "../../src/app/api/crm/contacts/[contactId]/route";
import {
  createDealsGetHandler,
  createDealsPatchHandler,
  createDealsPostHandler,
} from "../../src/app/api/crm/deals/route";
import {
  createDealGetHandler,
  createDealPatchHandler,
} from "../../src/app/api/crm/deals/[dealId]/route";
import {
  createDealContactDeleteHandler,
  createDealContactPatchHandler,
  createDealContactPostHandler,
} from "../../src/app/api/crm/deals/[dealId]/contacts/route";
import { handleAuthRequest } from "@/lib/auth/auth";
import { createOwnersGetHandler } from "../../src/app/api/crm/owners/route";
import type { AuthEmailAdapter, AuthEmailMessage } from "@/lib/email/email-adapter";
import { SINGLETON_WORKSPACE_ID } from "@/lib/services/members/singleton-workspace";
import { singletonMembership } from "@/lib/db/schema";
import {
  createCompositionRoot,
  type RuntimeEnv,
} from "@/lib/composition-root";

class RecordingEmailAdapter implements AuthEmailAdapter {
  verificationMessages: AuthEmailMessage[] = [];
  async sendVerification(message: AuthEmailMessage) {
    this.verificationMessages.push(message);
  }
  async sendPasswordReset() {}
}

const bindings = env as RuntimeEnv;
const password = "correct horse battery staple";
let requestIndex = 20;

async function clearState() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM activity_visibility"),
    env.DB.prepare("DELETE FROM activity"),
    env.DB.prepare("DELETE FROM custom_field_value"),
    env.DB.prepare("DELETE FROM saved_view"),
    env.DB.prepare("DELETE FROM deal_contact"),
    env.DB.prepare("DELETE FROM deal"),
    env.DB.prepare("DELETE FROM contact"),
    env.DB.prepare("DELETE FROM company"),
    env.DB.prepare("DELETE FROM session"),
    env.DB.prepare("DELETE FROM account"),
    env.DB.prepare("DELETE FROM verification"),
    env.DB.prepare("DELETE FROM rate_limit"),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('sentinel-owner', 'Sentinel Owner', 'sentinel-owner@example.com', 1, 0, 0)",
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO singleton_membership (user_id, role, status, created_at, updated_at) VALUES ('sentinel-owner', 'owner', 'active', 0, 0)",
    ),
    env.DB.prepare(
      "UPDATE singleton_membership SET role = 'owner', status = 'active' WHERE user_id = 'sentinel-owner'",
    ),
    env.DB.prepare(
      "UPDATE singleton_membership SET role = 'member' WHERE user_id != 'sentinel-owner' AND role = 'owner'",
    ),
    env.DB.prepare(
      "DELETE FROM singleton_membership WHERE user_id != 'sentinel-owner'",
    ),
    env.DB.prepare(
      "UPDATE singleton_workspace SET owner_user_id = 'sentinel-owner' WHERE id = ?",
    ).bind(SINGLETON_WORKSPACE_ID),
    env.DB.prepare("DELETE FROM user WHERE id != 'sentinel-owner'"),
  ]);
}

async function verifiedSession(email: string) {
  const emailAdapter = new RecordingEmailAdapter();
  const root = createCompositionRoot(bindings, emailAdapter);
  requestIndex += 1;
  const headers = {
    origin: "https://auth.test",
    "content-type": "application/json",
    "cf-connecting-ip": `203.0.113.${requestIndex}`,
  };
  const signUp = await handleAuthRequest(
    new Request("https://auth.test/api/auth/sign-up/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: email, email, password }),
    }),
    root.auth,
    root.db,
    bindings.AUTH_BASE_URL,
  );
  expect(signUp.status).toBe(200);
  const token = new URL(
    emailAdapter.verificationMessages.at(-1)?.url ?? "",
  ).searchParams.get("token");
  if (!token) throw new Error("Expected verification token");
  await root.auth.api.verifyEmail({
    asResponse: true,
    headers: new Headers({ origin: "https://auth.test" }),
    query: { token },
  });
  const signIn = await handleAuthRequest(
    new Request("https://auth.test/api/auth/sign-in/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
    }),
    root.auth,
    root.db,
    bindings.AUTH_BASE_URL,
  );
  const cookie = signIn.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Expected session cookie");
  const user = await root.db.query.user.findFirst({
    where: (fields, { eq }) => eq(fields.email, email),
  });
  if (!user) throw new Error("Expected user");
  return { cookie, userId: user.id };
}

function request(
  path: string,
  cookie?: string,
  method = "GET",
  body?: unknown,
) {
  const headers = new Headers({ "cf-ray": "core-crm-request" });
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    headers.set("origin", "https://auth.test");
    headers.set("sec-fetch-site", "same-origin");
  }
  return new Request(`https://auth.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(response: Response) {
  return response.json() as Promise<any>;
}

describe.sequential("core CRM API", () => {
  beforeEach(clearState);

  it("prevents caching authenticated list responses and authorization or validation errors", async () => {
    const root = createCompositionRoot(bindings, new RecordingEmailAdapter());
    const actor = await verifiedSession("cache-policy@example.com");
    const lists = [
      ["/api/crm/companies", createCompaniesGetHandler(root)],
      ["/api/crm/contacts", createContactsGetHandler(root)],
      ["/api/crm/deals", createDealsGetHandler(root)],
      ["/api/crm/owners", createOwnersGetHandler(root)],
    ] as const;
    for (const [path, handler] of lists) {
      const anonymous = await handler(request(path));
      expect(anonymous.status).toBe(401);
      expect(anonymous.headers.get("cache-control")).toBe("private, no-store");
      const authenticated = await handler(request(path, actor.cookie));
      expect(authenticated.status).toBe(200);
      expect(authenticated.headers.get("cache-control")).toBe("private, no-store");
    }
    const invalid = await createCompaniesGetHandler(root)(request("/api/crm/companies?page=0", actor.cookie));
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("cache-control")).toBe("private, no-store");
    await root.db.update(singletonMembership).set({ status: "revoked" }).where(eq(singletonMembership.userId, actor.userId));
    for (const [path, handler] of lists) {
      const forbidden = await handler(request(path, actor.cookie));
      expect(forbidden.status).toBe(403);
      expect(forbidden.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("lists active owners only and rejects anonymous or revoked callers", async () => {
    const root = createCompositionRoot(bindings, new RecordingEmailAdapter());
    const handler = createOwnersGetHandler(root);
    expect((await handler(request("/api/crm/owners"))).status).toBe(401);
    const actor = await verifiedSession("owners@example.com");
    const revoked = await verifiedSession("revoked@example.com");
    await root.db.update(singletonMembership).set({ status: "revoked" }).where(eq(singletonMembership.userId, revoked.userId));
    const response = await handler(request("/api/crm/owners", actor.cookie));
    expect(response.status).toBe(200);
    const owners = await json(response);
    expect(owners.rows.map((row: any) => row.membershipId).sort()).toEqual(["sentinel-owner", actor.userId].sort());
    expect((await handler(request("/api/crm/owners", revoked.cookie))).status).toBe(403);
  });

  it("filters punctuation-bearing titles and industries and omits unsupported blank facets", async () => {
    const actor = await verifiedSession("facets@example.com");
    const root = createCompositionRoot(bindings, new RecordingEmailAdapter());
    for (const industry of ["Media, Publishing", "Technology", null]) {
      const response = await createCompaniesPostHandler(root)(request("/api/crm/companies", actor.cookie, "POST", { name: industry ?? "Unclassified" }));
      expect(response.status).toBe(200);
      const company = await json(response);
      expect((await createCompanyPatchHandler(root, Promise.resolve({ companyId: company.id }))(request(`/api/crm/companies/${company.id}`, actor.cookie, "PATCH", { action: "update", data: { industry } }))).status).toBe(200);
    }
    const companies = await json(await createCompaniesGetHandler(root)(request("/api/crm/companies?industry=Media%2C+Publishing&industry=Technology", actor.cookie)));
    expect(companies.total).toBe(2);
    expect(companies.rows.map((row: any) => row.industry).sort()).toEqual(["Media, Publishing", "Technology"]);
    const allCompanies = await json(await createCompaniesGetHandler(root)(request("/api/crm/companies", actor.cookie)));
    expect(allCompanies.facets.industry.map((option: any) => option.value)).toEqual(["Media, Publishing", "Technology"]);
    for (const title of ["VP, Sales", "CEO", null]) {
      expect((await createContactsPostHandler(root)(request("/api/crm/contacts", actor.cookie, "POST", { firstName: title ?? "Untitled", title: title ?? undefined }))).status).toBe(200);
    }
    const contacts = await json(await createContactsGetHandler(root)(request("/api/crm/contacts?title=VP%2C+Sales&title=CEO", actor.cookie)));
    expect(contacts.total).toBe(2);
    expect(contacts.rows.map((row: any) => row.title).sort()).toEqual(["CEO", "VP, Sales"]);
    const allContacts = await json(await createContactsGetHandler(root)(request("/api/crm/contacts", actor.cookie)));
    expect(allContacts.facets.title.map((option: any) => option.value)).toEqual(["CEO", "VP, Sales"]);
    expect(allContacts.facets.company).toEqual([]);
    expect(allContacts.facets.owner).toEqual([{ value: "unassigned", label: "", count: 3 }]);
  });

  it("keeps facet choices independent of selected filters while respecting search and archive scope", async () => {
    const actor = await verifiedSession("facet-scope@example.com");
    const root = createCompositionRoot(bindings, new RecordingEmailAdapter());
    const create = async (name: string, industry: string, ownerMembershipId: string | null) => {
      const response = await createCompaniesPostHandler(root)(request("/api/crm/companies", actor.cookie, "POST", { name, ownerMembershipId }));
      expect(response.status).toBe(200);
      const company = await json(response);
      expect((await createCompanyPatchHandler(root, Promise.resolve({ companyId: company.id }))(request(`/api/crm/companies/${company.id}`, actor.cookie, "PATCH", { action: "update", data: { industry } }))).status).toBe(200);
      return company;
    };
    const first = await create("Alpha", "Industry A", actor.userId);
    const second = await create("Beta", "Industry B", null);
    const archived = await create("Archived", "Industry C", actor.userId);
    expect((await createCompaniesPatchHandler(root)(request("/api/crm/companies", actor.cookie, "PATCH", { action: "bulk-archive", ids: [archived.id] }))).status).toBe(200);
    const list = async (query: string) => {
      const response = await createCompaniesGetHandler(root)(request(`/api/crm/companies?${query}`, actor.cookie));
      expect(response.status).toBe(200);
      return json(response);
    };
    const activeChoices = [
      { value: "Industry A", label: "Industry A", count: 1 },
      { value: "Industry B", label: "Industry B", count: 1 },
    ];
    const single = await list("industry=Industry+A");
    expect(single.rows.map((row: any) => row.id)).toEqual([first.id]);
    expect(single.facets.industry).toEqual(activeChoices);
    const multiple = await list("industry=Industry+A&industry=Industry+B");
    expect(multiple.rows.map((row: any) => row.id).sort()).toEqual([first.id, second.id].sort());
    expect(multiple.facets.industry).toEqual(activeChoices);
    const owned = await list(`owner=${actor.userId}&industry=Industry+A`);
    expect(owned.rows.map((row: any) => row.id)).toEqual([first.id]);
    expect(owned.facets.industry).toEqual(activeChoices);
    expect(owned.facets.owner.map((option: any) => option.value).sort()).toEqual([actor.userId, "unassigned"].sort());
    const searched = await list(`q=Beta&owner=${actor.userId}&industry=Industry+A`);
    expect(searched.rows).toEqual([]);
    expect(searched.facets.industry).toEqual([activeChoices[1]]);
    expect(searched.facets.owner).toEqual([{ value: "unassigned", label: "", count: 1 }]);
    const archiveScope = await list("archived=true&industry=Industry+A");
    expect(archiveScope.rows).toEqual([]);
    expect(archiveScope.facets.industry).toEqual([{ value: "Industry C", label: "Industry C", count: 1 }]);
    const archiveSearch = await list("archived=true&q=Alpha");
    expect(archiveSearch.facets.industry).toEqual([]);
  });

  it("keeps contact bulk restore atomic on email conflicts and restores deduplicated selections", async () => {
    const actor = await verifiedSession("contact-restore@example.com");
    const root = createCompositionRoot(bindings, new RecordingEmailAdapter());
    const create = async (email: string) => json(await createContactsPostHandler(root)(request("/api/crm/contacts", actor.cookie, "POST", { firstName: email, email })));
    const first = await create("first@example.com");
    const second = await create("second@example.com");
    const mutate = (action: string, ids: string[]) => createContactsPatchHandler(root)(request("/api/crm/contacts", actor.cookie, "PATCH", { action, ids }));
    expect((await mutate("bulk-archive", [first.id, second.id])).status).toBe(200);
    const replacement = await create("second@example.com");
    expect((await mutate("bulk-restore", [first.id, second.id])).status).toBe(409);
    const archived = await json(await createContactsGetHandler(root)(request("/api/crm/contacts?archived=true", actor.cookie)));
    expect(archived.rows.map((row: any) => row.id).sort()).toEqual([first.id, second.id].sort());
    expect((await mutate("bulk-archive", [replacement.id])).status).toBe(200);
    expect(await json(await mutate("bulk-restore", [first.id, second.id, first.id]))).toEqual({ requested: 2, succeeded: 2, failed: 0 });
    const active = await json(await createContactsGetHandler(root)(request("/api/crm/contacts", actor.cookie)));
    expect(active.rows.map((row: any) => row.id).sort()).toEqual([first.id, second.id].sort());
  });

  it("restores selected deals and reports missing IDs without touching other archived deals", async () => {
    const actor = await verifiedSession("deal-restore@example.com");
    const root = createCompositionRoot(bindings, new RecordingEmailAdapter());
    const company = await json(await createCompaniesPostHandler(root)(request("/api/crm/companies", actor.cookie, "POST", { name: "Acme" })));
    const create = async (name: string) => json(await createDealsPostHandler(root)(request("/api/crm/deals", actor.cookie, "POST", { name, companyId: company.id, ownerMembershipId: actor.userId })));
    const selected = await create("Selected");
    const untouched = await create("Untouched");
    const mutate = (action: string, ids: string[]) => createDealsPatchHandler(root)(request("/api/crm/deals", actor.cookie, "PATCH", { action, ids }));
    expect((await mutate("bulk-archive", [selected.id, untouched.id])).status).toBe(200);
    expect(await json(await mutate("bulk-restore", [selected.id, selected.id, crypto.randomUUID()]))).toEqual({ requested: 2, succeeded: 1, failed: 1 });
    const active = await json(await createDealsGetHandler(root)(request("/api/crm/deals", actor.cookie)));
    expect(active.rows.map((row: any) => row.id)).toEqual([selected.id]);
    const archived = await json(await createDealsGetHandler(root)(request("/api/crm/deals?archived=true", actor.cookie)));
    expect(archived.rows.map((row: any) => row.id)).toEqual([untouched.id]);
  });

  it("guards every service with active singleton membership", async () => {
    const root = createCompositionRoot(bindings, new RecordingEmailAdapter());
    expect(
      (await createCompaniesGetHandler(root)(request("/api/crm/companies")))
        .status,
    ).toBe(401);
    expect(
      (await createContactsGetHandler(root)(request("/api/crm/contacts")))
        .status,
    ).toBe(401);
    expect(
      (await createDealsGetHandler(root)(request("/api/crm/deals"))).status,
    ).toBe(401);
    const member = await verifiedSession("member@example.com");
    expect(
      (
        await createCompaniesPostHandler(root)(
          request("/api/crm/companies", member.cookie, "POST", {
            name: "Acme",
          }),
        )
      ).status,
    ).toBe(200);
    await root.db
      .delete(singletonMembership)
      .where(eq(singletonMembership.userId, member.userId));
    expect(
      (
        await createCompaniesGetHandler(root)(
          request("/api/crm/companies", member.cookie),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await createContactsGetHandler(root)(
          request("/api/crm/contacts", member.cookie),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await createDealsGetHandler(root)(
          request("/api/crm/deals", member.cookie),
        )
      ).status,
    ).toBe(403);
  });

  it("supports company CRUD, conflicts, filters, archive, restore, and bulk de-duplication", async () => {
    const actor = await verifiedSession("actor@example.com");
    const root = createCompositionRoot(bindings, new RecordingEmailAdapter());
    const created = await createCompaniesPostHandler(root)(
      request("/api/crm/companies", actor.cookie, "POST", {
        name: "Acme",
        domain: "https://www.Acme.test/path",
        ownerMembershipId: actor.userId,
      }),
    );
    expect(created.status).toBe(200);
    const company = await json(created);
    expect(company).toMatchObject({ name: "Acme", domain: "acme.test" });
    expect(
      (
        await createCompaniesPostHandler(root)(
          request("/api/crm/companies", actor.cookie, "POST", {
            name: "Duplicate",
            domain: "acme.test",
          }),
        )
      ).status,
    ).toBe(409);
    const listed = await json(
      await createCompaniesGetHandler(root)(
        request(
          `/api/crm/companies?q=acme&owner=${actor.userId}&pageSize=25`,
          actor.cookie,
        ),
      ),
    );
    expect(listed).toMatchObject({
      total: 1,
      rows: [expect.objectContaining({ id: company.id })],
    });
    expect(
      (
        await createCompaniesGetHandler(root)(
          request("/api/crm/companies?unknown=true", actor.cookie),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await createCompanyPatchHandler(
          root,
          Promise.resolve({ companyId: company.id }),
        )(
          request(`/api/crm/companies/${company.id}`, actor.cookie, "PATCH", {
            action: "update",
            data: { industry: "Software" },
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await createCompanyPatchHandler(
          root,
          Promise.resolve({ companyId: company.id }),
        )(
          request(`/api/crm/companies/${company.id}`, actor.cookie, "PATCH", {
            action: "archive",
          }),
        )
      ).status,
    ).toBe(200);
    const replacement = await json(
      await createCompaniesPostHandler(root)(
        request("/api/crm/companies", actor.cookie, "POST", {
          name: "Replacement",
          domain: "acme.test",
        }),
      ),
    );
    expect(
      (
        await createCompanyPatchHandler(
          root,
          Promise.resolve({ companyId: company.id }),
        )(
          request(`/api/crm/companies/${company.id}`, actor.cookie, "PATCH", {
            action: "restore",
          }),
        )
      ).status,
    ).toBe(409);
    const bulk = await json(
      await createCompaniesPatchHandler(root)(
        request("/api/crm/companies", actor.cookie, "PATCH", {
          action: "bulk-archive",
          ids: [replacement.id, replacement.id],
        }),
      ),
    );
    expect(bulk).toEqual({ requested: 1, succeeded: 1, failed: 0 });
    expect(
      (
        await createCompaniesPatchHandler(root)(
          request("/api/crm/companies", actor.cookie, "PATCH", {
            action: "bulk-archive",
            ids: [],
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await createCompaniesPatchHandler(root)(
          request("/api/crm/companies", actor.cookie, "PATCH", {
            action: "bulk-archive",
            ids: Array.from({ length: 101 }, () => crypto.randomUUID()),
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await createCompanyGetHandler(
          root,
          Promise.resolve({ companyId: replacement.id }),
        )(request(`/api/crm/companies/${replacement.id}`, actor.cookie))
      ).status,
    ).toBe(200);
  });

  it("supports contact CRUD while validating company, owner, and active email uniqueness", async () => {
    const actor = await verifiedSession("actor@example.com");
    const root = createCompositionRoot(bindings, new RecordingEmailAdapter());
    const company = await json(
      await createCompaniesPostHandler(root)(
        request("/api/crm/companies", actor.cookie, "POST", { name: "Acme" }),
      ),
    );
    const created = await createContactsPostHandler(root)(
      request("/api/crm/contacts", actor.cookie, "POST", {
        firstName: "Ada",
        email: "ADA@example.com",
        companyId: company.id,
        ownerMembershipId: actor.userId,
      }),
    );
    expect(created.status).toBe(200);
    const contact = await json(created);
    expect(
      (
        await createContactsPostHandler(root)(
          request("/api/crm/contacts", actor.cookie, "POST", {
            firstName: "Other",
            email: "ada@example.com",
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await createContactsPostHandler(root)(
          request("/api/crm/contacts", actor.cookie, "POST", {
            firstName: "Missing",
            companyId: crypto.randomUUID(),
          }),
        )
      ).status,
    ).toBe(404);
    const newest = await json(
      await createContactsPostHandler(root)(
        request("/api/crm/contacts", actor.cookie, "POST", {
          firstName: "Newest",
        }),
      ),
    );
    await env.DB.prepare("UPDATE contact SET created_at = ? WHERE id = ?")
      .bind(Date.now() + 10_000, newest.id)
      .run();
    const ordered = await json(
      await createContactsGetHandler(root)(
        request("/api/crm/contacts", actor.cookie),
      ),
    );
    expect(ordered.rows[0].id).toBe(newest.id);
    await env.DB.prepare(
      "UPDATE contact SET created_at = 1000 WHERE id IN (?, ?)",
    )
      .bind(contact.id, newest.id)
      .run();
    const firstPage = await json(
      await createContactsGetHandler(root)(
        request("/api/crm/contacts?pageSize=1&page=1", actor.cookie),
      ),
    );
    const secondPage = await json(
      await createContactsGetHandler(root)(
        request("/api/crm/contacts?pageSize=1&page=2", actor.cookie),
      ),
    );
    expect([firstPage.rows[0].id, secondPage.rows[0].id]).toEqual(
      [contact.id, newest.id].sort(),
    );
    expect(
      (
        await createContactPatchHandler(
          root,
          Promise.resolve({ contactId: contact.id }),
        )(
          request(`/api/crm/contacts/${contact.id}`, actor.cookie, "PATCH", {
            action: "update",
            data: { title: "CTO", companyId: null },
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await createContactGetHandler(
          root,
          Promise.resolve({ contactId: contact.id }),
        )(request(`/api/crm/contacts/${contact.id}`, actor.cookie))
      ).status,
    ).toBe(200);
    const bulk = await json(
      await createContactsPatchHandler(root)(
        request("/api/crm/contacts", actor.cookie, "PATCH", {
          action: "bulk-archive",
          ids: [contact.id],
        }),
      ),
    );
    expect(bulk.succeeded).toBe(1);
    const archived = await json(
      await createContactsGetHandler(root)(
        request("/api/crm/contacts?archived=true", actor.cookie),
      ),
    );
    expect(archived.total).toBe(1);
  });

  it("requires deal relationships and atomically manages compatible participants", async () => {
    const actor = await verifiedSession("actor@example.com");
    const root = createCompositionRoot(bindings, new RecordingEmailAdapter());
    const company = await json(
      await createCompaniesPostHandler(root)(
        request("/api/crm/companies", actor.cookie, "POST", { name: "Acme" }),
      ),
    );
    const otherCompany = await json(
      await createCompaniesPostHandler(root)(
        request("/api/crm/companies", actor.cookie, "POST", { name: "Other" }),
      ),
    );
    const contact = await json(
      await createContactsPostHandler(root)(
        request("/api/crm/contacts", actor.cookie, "POST", {
          firstName: "Ada",
          companyId: company.id,
        }),
      ),
    );
    const outsider = await json(
      await createContactsPostHandler(root)(
        request("/api/crm/contacts", actor.cookie, "POST", {
          firstName: "Grace",
          companyId: otherCompany.id,
        }),
      ),
    );
    const created = await createDealsPostHandler(root)(
      request("/api/crm/deals", actor.cookie, "POST", {
        name: "Expansion",
        companyId: company.id,
        ownerMembershipId: actor.userId,
        amountMinor: 2500,
        currency: "usd",
      }),
    );
    expect(created.status).toBe(200);
    const deal = await json(created);
    expect(
      (
        await createDealsPostHandler(root)(
          request("/api/crm/deals", actor.cookie, "POST", {
            name: "Missing",
            companyId: crypto.randomUUID(),
            ownerMembershipId: actor.userId,
          }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await createDealContactPostHandler(
          root,
          Promise.resolve({ dealId: deal.id }),
        )(
          request(`/api/crm/deals/${deal.id}/contacts`, actor.cookie, "POST", {
            contactId: outsider.id,
          }),
        )
      ).status,
    ).toBe(409);
    const attached = await createDealContactPostHandler(
      root,
      Promise.resolve({ dealId: deal.id }),
    )(
      request(`/api/crm/deals/${deal.id}/contacts`, actor.cookie, "POST", {
        contactId: contact.id,
        role: "   ",
      }),
    );
    expect(attached.status).toBe(200);
    expect(await json(attached)).toMatchObject({ role: null });
    expect(
      (
        await createDealContactPatchHandler(
          root,
          Promise.resolve({ dealId: deal.id }),
        )(
          request(`/api/crm/deals/${deal.id}/contacts`, actor.cookie, "PATCH", {
            contactId: contact.id,
            role: "Champion",
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await createContactPatchHandler(
          root,
          Promise.resolve({ contactId: contact.id }),
        )(
          request(`/api/crm/contacts/${contact.id}`, actor.cookie, "PATCH", {
            action: "archive",
          }),
        )
      ).status,
    ).toBe(200);
    const detail = await json(
      await createDealGetHandler(
        root,
        Promise.resolve({ dealId: deal.id }),
      )(request(`/api/crm/deals/${deal.id}`, actor.cookie)),
    );
    expect(detail).toMatchObject({
      contacts: [expect.objectContaining({ id: contact.id, role: "Champion" })],
    });
    expect(
      (
        await createContactPatchHandler(
          root,
          Promise.resolve({ contactId: contact.id }),
        )(
          request(`/api/crm/contacts/${contact.id}`, actor.cookie, "PATCH", {
            action: "restore",
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await createDealContactDeleteHandler(
          root,
          Promise.resolve({ dealId: deal.id }),
        )(
          request(
            `/api/crm/deals/${deal.id}/contacts`,
            actor.cookie,
            "DELETE",
            { contactId: contact.id },
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await createDealPatchHandler(
          root,
          Promise.resolve({ dealId: deal.id }),
        )(
          request(`/api/crm/deals/${deal.id}`, actor.cookie, "PATCH", {
            action: "archive",
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await createDealPatchHandler(
          root,
          Promise.resolve({ dealId: deal.id }),
        )(
          request(`/api/crm/deals/${deal.id}`, actor.cookie, "PATCH", {
            action: "restore",
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await createDealsPatchHandler(root)(
          request("/api/crm/deals", actor.cookie, "PATCH", {
            action: "bulk-archive",
            ids: [deal.id],
          }),
        )
      ).status,
    ).toBe(200);
    const archived = await json(
      await createDealsGetHandler(root)(
        request("/api/crm/deals?archived=true&stage=demo-booked", actor.cookie),
      ),
    );
    expect(archived.total).toBe(1);
  });

  it("fails closed when a service violates its output contract", async () => {
    const actor = await verifiedSession("actor@example.com");
    const root = createCompositionRoot(bindings, new RecordingEmailAdapter());
    Object.defineProperty(root.companies, "list", {
      value: async () => ({ total: -1, rows: [] }),
    });

    const response = await createCompaniesGetHandler(root)(
      request("/api/crm/companies", actor.cookie),
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await json(response)).toEqual({
      error: { code: "internal_error", requestId: "core-crm-request" },
    });
  });

  it("restores selected records atomically and returns SQL facet counts", async () => {
    const actor = await verifiedSession("restore@example.com");
    const root = createCompositionRoot(bindings, new RecordingEmailAdapter());
    const create = (name: string, domain: string) => createCompaniesPostHandler(root)(request("/api/crm/companies", actor.cookie, "POST", { name, domain })).then(json);
    const first = await create("First", "first.test");
    const second = await create("Second", "second.test");
    const mutation = (action: string, ids: string[]) => createCompaniesPatchHandler(root)(request("/api/crm/companies", actor.cookie, "PATCH", { action, ids }));
    expect((await mutation("bulk-archive", [first.id, second.id])).status).toBe(200);
    const replacement = await create("Replacement", "second.test");
    expect((await mutation("bulk-restore", [first.id, second.id])).status).toBe(409);
    const archived = await json(await createCompaniesGetHandler(root)(request("/api/crm/companies?archived=true", actor.cookie)));
    expect(archived.total).toBe(2);
    expect(archived.facets.owner).toEqual([{ value: "unassigned", label: "", count: 2 }]);
    expect((await mutation("bulk-archive", [replacement.id])).status).toBe(200);
    const restored = await json(await mutation("bulk-restore", [first.id, second.id, first.id]));
    expect(restored).toEqual({ requested: 2, succeeded: 2, failed: 0 });
  });
});
