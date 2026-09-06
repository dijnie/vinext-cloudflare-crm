import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { handleAuthRequest } from "@/lib/auth/auth";
import type { AuthEmailAdapter, AuthEmailMessage } from "@/lib/email/email-adapter";
import { SINGLETON_WORKSPACE_ID } from "@/lib/services/members/singleton-workspace";
import { createCompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
class RecordingEmailAdapter implements AuthEmailAdapter {
  verificationMessages: AuthEmailMessage[] = [];
  async sendVerification(message: AuthEmailMessage) { this.verificationMessages.push(message); }
  async sendPasswordReset() {}
}
const bindings = env as RuntimeEnv;
let requestIndex = 50;
const root = () => createCompositionRoot(bindings, new RecordingEmailAdapter());
async function successful(response: Response) {
  const body = await response.json() as any;
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body;
}
async function session(email: string) {
  const adapter = new RecordingEmailAdapter();
  const composition = createCompositionRoot(bindings, adapter);
  const headers = { origin: "https://auth.test", "content-type": "application/json", "cf-connecting-ip": `192.0.2.${++requestIndex}` };
  const auth = (path: string, body: unknown) => handleAuthRequest(new Request(`https://auth.test/api/auth/${path}`, { method: "POST", headers, body: JSON.stringify(body) }), composition.auth, composition.db, bindings.AUTH_BASE_URL);
  const password = "correct horse battery staple";
  await successful(await auth("sign-up/email", { name: email, email, password }));
  const token = new URL(adapter.verificationMessages.at(-1)?.url ?? "").searchParams.get("token");
  if (!token) throw new Error("Expected verification token");
  await composition.auth.api.verifyEmail({ asResponse: true, headers: new Headers({ origin: "https://auth.test" }), query: { token } });
  const signedIn = await auth("sign-in/email", { email, password });
  expect(signedIn.status).toBe(200);
  const cookie = signedIn.headers.get("set-cookie")?.split(";", 1)[0];
  const user = await composition.db.query.user.findFirst({ where: (fields, { eq }) => eq(fields.email, email) });
  if (!cookie || !user) throw new Error("Expected verified session");
  return { cookie, id: user.id };
}
async function clearState() {
  await env.DB.batch([
    env.DB.prepare("UPDATE module_setting SET enabled=1"),
    ...["activity_visibility", "activity", "custom_field_value", "custom_field_option", "custom_field_definition", "saved_view", "deal_contact", "deal", "contact", "company", "session", "account", "verification", "rate_limit"].map(table => env.DB.prepare(`DELETE FROM ${table}`)),
    env.DB.prepare("INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('sentinel-owner', 'Sentinel Owner', 'sentinel-owner@example.com', 1, 0, 0)"),
    env.DB.prepare("INSERT OR IGNORE INTO singleton_membership (user_id, role, status, created_at, updated_at) VALUES ('sentinel-owner', 'owner', 'active', 0, 0)"),
    env.DB.prepare("UPDATE singleton_membership SET role = 'owner', status = 'active' WHERE user_id = 'sentinel-owner'"),
    env.DB.prepare("UPDATE singleton_membership SET role = 'member' WHERE user_id != 'sentinel-owner' AND role = 'owner'"),
    env.DB.prepare("DELETE FROM singleton_membership WHERE user_id != 'sentinel-owner'"),
    env.DB.prepare("UPDATE singleton_workspace SET owner_user_id = 'sentinel-owner' WHERE id = ?").bind(SINGLETON_WORKSPACE_ID),
    env.DB.prepare("DELETE FROM user WHERE id != 'sentinel-owner'"),
  ]);
}

import { requireRequestContext } from "@/lib/http/request-context";
import type { AppDatabase } from "@/lib/db/database";
import { DealStageService } from "@/lib/services/deals/deal-stage-service";
import { DealService } from "@/lib/services/deals/deal-service";
import { dealCreateInputSchema, dealListInputSchema, dealListOutputSchema } from "@/lib/services/deals/deal-contract";
import { DEAL_STAGE_IDS, dealStageCatalogSchema, stageMutationSchema } from "@/lib/services/deals/deal-stage-contracts";
import { fieldCreateInputSchema } from "@/lib/services/custom-fields/field-contracts";
import { stageChangeMetadataSchema } from "@/lib/services/activities/activity-contract";

async function setup() {
  const actor = await session(`stage-${crypto.randomUUID()}@example.com`);
  await env.DB.prepare("UPDATE singleton_membership SET role='owner' WHERE user_id=?").bind(actor.id).run();
  const services = root();
  const context = await requireRequestContext(new Headers({ cookie: actor.cookie }), services);
  const stages = new DealStageService(services.db);
  return { actor, services, context, stages };
}
async function createStage(fixture: Awaited<ReturnType<typeof setup>>, closedState: "open" | "won" | "lost" = "open") {
  const before = await fixture.stages.get(fixture.context);
  const catalog = await fixture.stages.mutate(fixture.context, { action: "create", label: `Custom ${closedState}`, closedState, revision: before.revision });
  return catalog.stages.find(row => !before.stages.some(previous => previous.id === row.id))!;
}
function interceptBatch(db: AppDatabase, before: () => Promise<unknown>): AppDatabase {
  return new Proxy(db, { get(target, property) {
    if (property === "batch") return async (statements: Parameters<AppDatabase["batch"]>[0]) => { await before(); return target.batch(statements); };
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

describe.sequential("deal stage configuration", () => {
  beforeEach(clearState);

  it("preserves legacy semantics and reads catalogs with modules disabled while restricting owner writes", async () => {
    const fixture = await setup();
    const { stages, context, actor } = fixture;
    const initial = dealStageCatalogSchema.parse(await stages.get(context));
    expect(initial.defaultStageId).toBe("demo-booked");
    expect(initial.stages.filter(stage => DEAL_STAGE_IDS.some(id => id === stage.id)).map(stage => [stage.id, stage.closedState, stage.label])).toEqual([
      ["demo-booked", "open", null], ["qualified-to-buy", "open", null], ["unqualified-to-buy", "lost", null], ["decision-maker-bought-in", "open", null], ["contract-sent", "open", null], ["closed-won", "won", null], ["closed-lost", "lost", null],
    ]);
    await env.DB.prepare("UPDATE module_setting SET enabled=0").run();
    await createStage(fixture);
    await env.DB.prepare("UPDATE singleton_membership SET role='member' WHERE user_id=?").bind(actor.id).run();
    expect((await stages.get(context)).canManage).toBe(false);
    await expect(stages.mutate(context, { action: "archive", id: "qualified-to-buy", revision: (await stages.get(context)).revision })).rejects.toMatchObject({ status: 403 });
    await env.DB.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id=?").bind(actor.id).run();
    await expect(stages.get(context)).rejects.toMatchObject({ status: 403 });
  });

  it("relabels, restores translations, reorders retained stages, archives and restores with opaque revisions", async () => {
    const fixture = await setup(); const { stages, context } = fixture;
    const custom = await createStage(fixture);
    let catalog = await stages.get(context);
    catalog = await stages.mutate(context, { action: "relabel", id: "qualified-to-buy", label: "Qualified override", revision: catalog.revision });
    expect(catalog.stages.find(row => row.id === "qualified-to-buy")?.label).toBe("Qualified override");
    catalog = await stages.mutate(context, { action: "relabel", id: "qualified-to-buy", label: null, revision: catalog.revision });
    expect(catalog.stages.find(row => row.id === "qualified-to-buy")?.label).toBeNull();
    await expect(stages.mutate(context, { action: "relabel", id: custom.id, label: null, revision: catalog.revision })).rejects.toMatchObject({ status: 400 });
    catalog = await stages.mutate(context, { action: "archive", id: custom.id, revision: catalog.revision });
    expect(catalog.stages.find(row => row.id === custom.id)?.archivedAt).not.toBeNull();
    catalog = await stages.mutate(context, { action: "reorder", id: custom.id, beforeId: "demo-booked", revision: catalog.revision });
    expect(catalog.stages[0]?.id).toBe(custom.id);
    expect(new Set(catalog.stages.map(row => row.position)).size).toBe(catalog.stages.length);
    catalog = await stages.mutate(context, { action: "restore", id: custom.id, revision: catalog.revision });
    expect(catalog.stages[0]?.archivedAt).toBeNull();
    catalog = await stages.mutate(context, { action: "reorder", id: custom.id, beforeId: null, revision: catalog.revision });
    expect(catalog.stages.at(-1)?.id).toBe(custom.id);
    await expect(stages.mutate(context, { action: "reorder", id: custom.id, beforeId: custom.id, revision: catalog.revision })).rejects.toMatchObject({ status: 400 });
    expect(stageMutationSchema.safeParse({ action: "create", revision: catalog.revision, label: "New", closedState: "open", id: crypto.randomUUID() }).success).toBe(false);
  });

  it("rejects concurrent and between-check catalog revisions without partial ordering", async () => {
    const fixture = await setup(); const { stages, context, services } = fixture;
    const catalog = await stages.get(context);
    const results = await Promise.allSettled([
      stages.mutate(context, { action: "relabel", id: "qualified-to-buy", label: "First", revision: catalog.revision }),
      stages.mutate(context, { action: "relabel", id: "qualified-to-buy", label: "Second", revision: catalog.revision }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    const before = await stages.get(context);
    const raced = new DealStageService(interceptBatch(services.db, () => env.DB.prepare("UPDATE deal_stage SET label='Concurrent' WHERE id='contract-sent'").run()));
    await expect(raced.mutate(context, { action: "reorder", id: "closed-lost", beforeId: "demo-booked", revision: before.revision })).rejects.toMatchObject({ status: 409 });
    expect((await stages.get(context)).stages.map(row => [row.id, row.position])).toEqual(before.stages.map(row => [row.id, row.position]));
  });

  it("rechecks owner role within the mutation batch", async () => {
    const { stages, services, context, actor } = await setup();
    const before = await stages.get(context);
    const raced = new DealStageService(interceptBatch(services.db, () => env.DB.prepare("UPDATE singleton_membership SET role='member' WHERE user_id=?").bind(actor.id).run()));
    await expect(raced.mutate(context, { action: "create", label: "Forbidden", closedState: "open", revision: before.revision })).rejects.toMatchObject({ status: 403 });
    expect((await stages.get(context)).stages).toEqual(before.stages);
    expect((await stages.get(context)).revision).toBe(before.revision);
  });

  it("protects default availability, identity, semantics and retained historical rows", async () => {
    const fixture = await setup(); const { stages, context } = fixture;
    const custom = await createStage(fixture, "lost");
    await expect(stages.mutate(context, { action: "archive", id: "demo-booked", revision: (await stages.get(context)).revision })).rejects.toMatchObject({ status: 400 });
    for (const statement of [
      "UPDATE deal_stage SET archived_at=1 WHERE id='demo-booked'",
      "UPDATE deal_stage SET id='changed' WHERE id='qualified-to-buy'",
      "UPDATE deal_stage SET label_key='changed' WHERE id='qualified-to-buy'",
      "UPDATE deal_stage SET closed_state='won' WHERE id='qualified-to-buy'",
      "DELETE FROM deal_stage WHERE id='qualified-to-buy'",
    ]) await expect(env.DB.prepare(statement).run()).rejects.toThrow();
    await expect(env.DB.prepare("DELETE FROM deal_stage WHERE id=?").bind(custom.id).run()).rejects.toThrow();
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });

  it("supports custom semantics and archived historical updates without rewriting records or history", async () => {
    const fixture = await setup(); const { stages, context, services, actor } = fixture;
    const company = await services.companies.create(context, { name: "Stage company" });
    const open = await createStage(fixture), won = await createStage(fixture, "won"), lost = await createStage(fixture, "lost");
    const record = await services.deals.create(context, dealCreateInputSchema.parse({ name: "Custom deal", companyId: company.id, ownerMembershipId: actor.id, stageId: open.id }));
    await services.deals.update(context, record.id, { stageId: lost.id, closedReason: "No budget" });
    expect(await services.deals.byId(context, record.id)).toMatchObject({ stageId: lost.id, closedState: "lost", closedReason: "No budget", stageLabel: "Custom lost" });
    await services.deals.update(context, record.id, { stageId: won.id });
    expect(await services.deals.byId(context, record.id)).toMatchObject({ stageId: won.id, closedState: "won", closedReason: null });
    const before = await env.DB.prepare("SELECT * FROM deal WHERE id=?").bind(record.id).first();
    const history = (await env.DB.prepare("SELECT * FROM activity WHERE deal_id=? ORDER BY id").bind(record.id).all()).results;
    const catalog = await stages.get(context);
    await stages.mutate(context, { action: "archive", id: won.id, revision: catalog.revision });
    expect(await env.DB.prepare("SELECT * FROM deal WHERE id=?").bind(record.id).first()).toEqual(before);
    expect((await env.DB.prepare("SELECT * FROM activity WHERE deal_id=? ORDER BY id").bind(record.id).all()).results).toEqual(history);
    await services.deals.update(context, record.id, { name: "Historical edit", stageId: won.id });
    await expect(services.deals.create(context, dealCreateInputSchema.parse({ name: "Unavailable", companyId: company.id, ownerMembershipId: actor.id, stageId: won.id }))).rejects.toMatchObject({ status: 400 });
    await services.deals.update(context, record.id, { stageId: open.id });
    expect((await services.deals.byId(context, record.id)).closedAt).toBeNull();
    await expect(services.deals.update(context, record.id, { stageId: won.id })).rejects.toMatchObject({ status: 400 });
    expect(stageChangeMetadataSchema.safeParse({ fromStageId: open.id, toStageId: won.id }).success).toBe(true);
    const listed = await services.deals.list(context, dealListInputSchema.parse({ stage: [open.id, won.id] }));
    expect(listed.total).toBe(1);
    expect(dealListOutputSchema.safeParse(listed).success).toBe(true);
  });

  it("rolls back stage transitions and base creation when targets are archived after precheck", async () => {
    const fixture = await setup(); const { services, context, actor } = fixture;
    const target = await createStage(fixture);
    const company = await services.companies.create(context, { name: "Race company" });
    const field = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "deal", type: "text", label: "Race payload" }));
    const record = await services.deals.create(context, dealCreateInputSchema.parse({ name: "Original", companyId: company.id, ownerMembershipId: actor.id, amountMinor: 100, customFields: { [field.key]: "Original value" } }));
    const beforeValues = (await env.DB.prepare("SELECT * FROM custom_field_value WHERE deal_id=?").bind(record.id).all()).results;
    const beforeConversion = (await env.DB.prepare("SELECT * FROM deal_conversion WHERE deal_id=?").bind(record.id).all()).results;
    expect(beforeValues).toHaveLength(1);
    expect(beforeConversion).toEqual([expect.objectContaining({ amount_minor: 100, base_amount_minor: 100, money_revision: 0 })]);
    const before = await env.DB.prepare("SELECT * FROM deal WHERE id=?").bind(record.id).first();
    // The repository uses the native D1 batch for stage updates, so intercept that boundary too.
    const native = services.db.$client;
    const racedClient = new Proxy(native, { get(targetDb, property) {
      if (property === "batch") return async (statements: D1PreparedStatement[]) => { await env.DB.prepare("UPDATE deal_stage SET archived_at=1 WHERE id=?").bind(target.id).run(); return targetDb.batch(statements); };
      const value = Reflect.get(targetDb, property); return typeof value === "function" ? value.bind(targetDb) : value;
    } });
    const racedDb = new Proxy(services.db, { get(db, property) { if (property === "$client") return racedClient; const value = Reflect.get(db, property); return typeof value === "function" ? value.bind(db) : value; } });
    await expect(new DealService(racedDb).update(context, record.id, { name: "Partial", stageId: target.id, amountMinor: 250, customFields: { [field.key]: "Changed value" } })).rejects.toMatchObject({ status: 409 });
    expect(await env.DB.prepare("SELECT * FROM deal WHERE id=?").bind(record.id).first()).toEqual(before);
    expect((await env.DB.prepare("SELECT * FROM custom_field_value WHERE deal_id=?").bind(record.id).all()).results).toEqual(beforeValues);
    expect((await env.DB.prepare("SELECT * FROM deal_conversion WHERE deal_id=?").bind(record.id).all()).results).toEqual(beforeConversion);
    expect((await env.DB.prepare("SELECT * FROM activity WHERE deal_id=?").bind(record.id).all()).results).toEqual([]);
    await env.DB.prepare("UPDATE deal_stage SET archived_at=NULL WHERE id=?").bind(target.id).run();
    const racedCreate = new DealService(interceptBatch(services.db, () => env.DB.prepare("UPDATE deal_stage SET archived_at=1 WHERE id=?").bind(target.id).run()));
    await expect(racedCreate.create(context, dealCreateInputSchema.parse({ name: "Partial create", companyId: company.id, ownerMembershipId: actor.id, stageId: target.id }))).rejects.toMatchObject({ status: 409 });
    expect((await env.DB.prepare("SELECT id FROM deal").all()).results).toEqual([{ id: record.id }]);
  });
});
