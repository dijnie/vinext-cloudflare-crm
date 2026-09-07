import { env } from "cloudflare:test";
import { beforeEach, expect, it } from "vitest";
import { createCompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import type { AuthEmailAdapter } from "@/lib/email/email-adapter";
import type { RequestContext } from "@/lib/http/request-context";
import { createIntegrationContactsGetHandler } from "@/app/api/integrations/contacts/route";
import {
  createIntegrationLeadsGetHandler,
  createIntegrationLeadsPostHandler,
} from "@/app/api/integrations/leads/route";
import { createIntegrationTicketsPostHandler } from "@/app/api/integrations/tickets/route";
import { createIntegrationEventHandler } from "@/app/api/integrations/events/route";
import { GET as legacyContactsGet } from "@/app/api/integrations/contacts/route";
import { GET as v1ContactsGet } from "@/app/api/integrations/v1/contacts/route";
import {
  GET as legacyLeadsGet,
  POST as legacyLeadsPost,
} from "@/app/api/integrations/leads/route";
import {
  GET as v1LeadsGet,
  POST as v1LeadsPost,
} from "@/app/api/integrations/v1/leads/route";
import { POST as legacyTicketsPost } from "@/app/api/integrations/tickets/route";
import { POST as v1TicketsPost } from "@/app/api/integrations/v1/tickets/route";
import { POST as legacyEventsPost } from "@/app/api/integrations/events/route";
import { POST as v1EventsPost } from "@/app/api/integrations/v1/events/route";

const adapter: AuthEmailAdapter = {
  async sendVerification() {},
  async sendPasswordReset() {},
};
async function setup() {
  const id = crypto.randomUUID(),
    now = Date.now();
  await env.DB.prepare(
    "INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,1,?,?)",
  )
    .bind(id, "Route owner", `${id}@example.com`, now, now)
    .run();
  await env.DB.prepare(
    "INSERT INTO singleton_membership(user_id,role,status,created_at,updated_at) VALUES(?,'owner','active',?,?)",
  )
    .bind(id, now, now)
    .run();
  const root = createCompositionRoot(env as unknown as RuntimeEnv, adapter),
    context = {
      userId: id,
      membershipId: id,
      role: "owner",
      user: { name: "Route owner", email: `${id}@example.com` },
      requestId: crypto.randomUUID(),
    } as RequestContext;
  return { root, context };
}
const json = (response: Response) =>
  response.json() as Promise<Record<string, unknown>>;
beforeEach(async () => {
  for (const table of [
    "integration_event",
    "integration_app_audit",
    "integration_app",
  ]) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
});

it("serves legacy and v1 URLs through the same scoped handlers", async () => {
  expect(v1ContactsGet).toBe(legacyContactsGet);
  expect(v1LeadsGet).toBe(legacyLeadsGet);
  expect(v1LeadsPost).toBe(legacyLeadsPost);
  expect(v1TicketsPost).toBe(legacyTicketsPost);
  expect(v1EventsPost).toBe(legacyEventsPost);
  const { root, context } = await setup(),
    app = await root.integrations.createApp(context, {
      name: "Route app",
      grants: [
        "contacts.read",
        "leads.read",
        "leads.create",
        "tickets.create",
        "events.write",
      ],
    }),
    headers = {
      authorization: `Bearer ${app.token}`,
      "content-type": "application/json",
    };
  const contactHandler = createIntegrationContactsGetHandler(root),
    legacyContacts = await contactHandler(
      new Request("https://crm.test/api/integrations/contacts", { headers }),
    ),
    v1Contacts = await contactHandler(
      new Request("https://crm.test/api/integrations/v1/contacts", { headers }),
    );
  expect(v1Contacts.status).toBe(legacyContacts.status);
  expect(await json(v1Contacts)).toEqual(await json(legacyContacts));
  const leadPost = createIntegrationLeadsPostHandler(root),
    lead = await leadPost(
      new Request("https://crm.test/api/integrations/v1/leads", {
        method: "POST",
        headers,
        body: JSON.stringify({
          operationKey: "route-lead",
          firstName: "Route lead",
          sourceId: "manual",
        }),
      }),
    );
  expect(lead.status).toBe(200);
  expect(
    await createIntegrationLeadsGetHandler(root)(
      new Request("https://crm.test/api/integrations/leads", { headers }),
    ).then(json),
  ).toMatchObject({
    rows: [expect.objectContaining({ firstName: "Route lead" })],
  });
  expect(
    (
      await createIntegrationTicketsPostHandler(root)(
        new Request("https://crm.test/api/integrations/v1/tickets", {
          method: "POST",
          headers,
          body: JSON.stringify({
            operationKey: "route-ticket",
            subject: "Route ticket",
            source: "api",
          }),
        }),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await createIntegrationEventHandler(root)(
        new Request("https://crm.test/api/integrations/v1/events", {
          method: "POST",
          headers,
          body: JSON.stringify({
            externalId: "route-event",
            subjectId: "route-subject",
            type: "route.received",
            occurredAt: "2026-09-07T00:00:00.000Z",
            payload: { ok: true },
          }),
        }),
      )
    ).status,
  ).toBe(200);
});

it("rejects a valid key that lacks the route grant", async () => {
  const { root, context } = await setup();
  const app = await root.integrations.createApp(context, {
    name: "Contacts only",
    grants: ["contacts.read"],
  });
  const response = await createIntegrationLeadsGetHandler(root)(
    new Request("https://crm.test/api/integrations/v1/leads", {
      headers: { authorization: `Bearer ${app.token}` },
    }),
  );
  expect(response.status).toBe(401);
  await expect(json(response)).resolves.toMatchObject({
    error: { code: "authentication_required" },
  });
});
