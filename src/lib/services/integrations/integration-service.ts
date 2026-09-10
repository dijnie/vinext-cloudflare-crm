import { and, count, desc, eq, gt, isNull, notLike, sql } from "drizzle-orm";
import {
  executeD1Batch,
  type AppDatabase,
  type DrizzleD1Query,
} from "@/lib/db/database";
import {
  activity,
  aiSetting,
  appointment,
  automationRule,
  automationRun,
  company,
  contact,
  contract,
  customerSegment,
  customerSegmentMember,
  deal,
  emailTemplate,
  integrationApp,
  integrationAppAudit,
  integrationEvent,
  integrationOutbox,
  lead,
  notification,
  operationConditionGuard,
  scheduledDueFence,
  singletonMembership,
  taskCycle,
  taskRecord,
  ticket,
  ticketCycle,
  ticketEvent,
  ticketSequence,
  user,
  webhookEndpoint,
} from "@/lib/db/schema";
import type { RequestContext } from "@/lib/http/request-context";
import { HttpError } from "@/lib/http/http-errors";
import {
  actionGuard,
  authorizedBatch,
  permissionError,
  requirePermission,
} from "../permissions/permission-policy";
import type {
  AppCreate,
  AppLeadCreate,
  AppTicketCreate,
  AutomationAction,
  AutomationCreate,
  EndpointCreate,
  InboundEvent,
  SegmentCreate,
  TemplateCreate,
} from "./integration-contract";
import { WebhookSecretCrypto } from "./webhook-secret-crypto";

const encoder = new TextEncoder();
const bytes = (value: ArrayBuffer) =>
  [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
async function hash(value: string) {
  return bytes(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytes(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
function createApiKey() {
  const value = crypto.getRandomValues(new Uint8Array(16));
  return bytes(value.buffer);
}
function activeAppGrant(tokenHash: string, grant: string, appId?: string) {
  return sql`exists(select 1 from ${integrationApp} join ${singletonMembership} on ${singletonMembership.userId}=${integrationApp.authorityMembershipId} and ${singletonMembership.status}='active',json_each(${integrationApp.grantsJson}) app_grant where ${integrationApp.tokenHash}=${tokenHash} and ${integrationApp.status}='active' and app_grant.value=${grant} ${appId ? sql`and ${integrationApp.id}=${appId}` : sql``})`;
}

export interface WebhookTransport {
  send(input: {
    url: string;
    headers: Headers;
    body: string;
  }): Promise<{ status: number }>;
}
export class IntegrationService {
  private readonly webhookSecrets: WebhookSecretCrypto;
  constructor(
    private readonly db: AppDatabase,
    rootSecret: string,
    webhookEncryptionKey: string,
  ) {
    this.webhookSecrets = new WebhookSecretCrypto(
      webhookEncryptionKey,
      rootSecret,
    );
  }
  private appRows(rows: (typeof integrationApp.$inferSelect)[]) {
    return rows.map(({ tokenHash: _, grantsJson, ...app }) => ({
      ...app,
      grants: JSON.parse(grantsJson) as string[],
    }));
  }
  async apps(context: RequestContext) {
    await requirePermission(this.db, context, ["integration.manage"], true);
    return this.appRows(await this.db.select().from(integrationApp));
  }
  async dashboard(context: RequestContext) {
    await requirePermission(this.db, context, ["integration.manage"], true);
    const [apps, endpoints, templates, rules, segments, ai] = await Promise.all(
      [
        this.db.select().from(integrationApp),
        this.db
          .select({
            id: webhookEndpoint.id,
            name: webhookEndpoint.name,
            url: webhookEndpoint.url,
            eventsJson: webhookEndpoint.eventsJson,
            active: webhookEndpoint.active,
            revision: webhookEndpoint.revision,
          })
          .from(webhookEndpoint),
        this.db.select().from(emailTemplate),
        this.db.select().from(automationRule),
        this.db.select().from(customerSegment),
        this.db.select().from(aiSetting).get(),
      ],
    );
    return {
      apps: this.appRows(apps),
      endpoints: endpoints.map((item) => ({
        ...item,
        events: JSON.parse(item.eventsJson),
      })),
      templates: templates.map((item) => ({
        ...item,
        requiredVariables: JSON.parse(item.requiredVariablesJson),
      })),
      rules: rules.map((item) => ({
        ...item,
        condition: JSON.parse(item.conditionJson),
        action: JSON.parse(item.actionJson),
      })),
      segments: segments.map((item) => ({
        ...item,
        filter: JSON.parse(item.filterJson),
      })),
      ai,
    };
  }
  async createApp(context: RequestContext, input: AppCreate) {
    await requirePermission(this.db, context, ["integration.manage"], true);
    const token = createApiKey(),
      id = crypto.randomUUID(),
      now = new Date();
    await authorizedBatch(
      this.db,
      context,
      ["integration.manage"],
      [
        this.db
          .insert(integrationApp)
          .values({
            id,
            name: input.name,
            tokenHash: await hash(token),
            tokenHint: token.slice(-4),
            grantsJson: JSON.stringify([...new Set(input.grants)]),
            authorityMembershipId: context.membershipId,
            status: "active",
            revision: 0,
            createdAt: now,
            updatedAt: now,
          }),
        this.db
          .insert(integrationAppAudit)
          .values({
            id: crypto.randomUUID(),
            appId: id,
            actorMembershipId: context.membershipId,
            action: "created",
            outcome: "success",
            createdAt: now,
          }),
      ],
    );
    return { id, token };
  }
  async rotateApp(context: RequestContext, id: string, revision: number) {
    await requirePermission(this.db, context, ["integration.manage"], true);
    const token = createApiKey(),
      tokenHash = await hash(token),
      auditId = crypto.randomUUID(),
      now = new Date(),
      guard = actionGuard(this.db, context, ["integration.manage"], true);
    try {
      const [, mutation] = await executeD1Batch(this.db, [
        guard.begin,
        this.db
          .update(integrationApp)
          .set({
            tokenHash,
            tokenHint: token.slice(-4),
            lastUsedAt: null,
            updatedAt: now,
            revision: revision + 1,
          })
          .where(
            and(
              eq(integrationApp.id, id),
              eq(integrationApp.status, "active"),
              eq(integrationApp.revision, revision),
            ),
          )
          .returning({ id: integrationApp.id }),
        sql`insert into ${integrationAppAudit} (id,app_id,actor_membership_id,action,outcome,created_at) select ${auditId},${integrationApp.id},${context.membershipId},'rotated','success',${now.getTime()} from ${integrationApp} where ${integrationApp.id}=${id} and ${integrationApp.tokenHash}=${tokenHash} and ${integrationApp.status}='active' and ${integrationApp.revision}=${revision + 1}`,
        guard.end,
      ]);
      if (!mutation.results.length)
        throw new HttpError(
          409,
          "conflict",
          "App changed or was already revoked",
        );
    } catch (error) {
      permissionError(error);
    }
    return { id, token, revision: revision + 1 };
  }
  async revokeApp(context: RequestContext, id: string, revision: number) {
    await requirePermission(this.db, context, ["integration.manage"], true);
    const auditId = crypto.randomUUID(),
      now = new Date(),
      guard = actionGuard(this.db, context, ["integration.manage"], true);
    try {
      const [, mutation] = await executeD1Batch(this.db, [
        guard.begin,
        this.db
          .update(integrationApp)
          .set({
            status: "revoked",
            revokedAt: now,
            updatedAt: now,
            revision: revision + 1,
          })
          .where(
            and(
              eq(integrationApp.id, id),
              eq(integrationApp.status, "active"),
              eq(integrationApp.revision, revision),
            ),
          )
          .returning({ id: integrationApp.id }),
        sql`insert into ${integrationAppAudit} (id,app_id,actor_membership_id,action,outcome,created_at) select ${auditId},${integrationApp.id},${context.membershipId},'revoked','success',${now.getTime()} from ${integrationApp} where ${integrationApp.id}=${id} and ${integrationApp.status}='revoked' and ${integrationApp.revokedAt}=${now.getTime()} and ${integrationApp.revision}=${revision + 1}`,
        guard.end,
      ]);
      if (!mutation.results.length)
        throw new HttpError(
          409,
          "conflict",
          "App changed or was already revoked",
        );
    } catch (error) {
      permissionError(error);
    }
    return { id, status: "revoked" as const };
  }
  async receive(token: string, input: InboundEvent) {
    const tokenHash = await hash(token),
      app = await this.authorizeApp(token, "events.write");
    const payloadJson = JSON.stringify(input.payload),
      occurred = Date.parse(input.occurredAt),
      prior = await this.db
        .select()
        .from(integrationEvent)
        .where(
          and(
            eq(integrationEvent.appId, app.id),
            eq(integrationEvent.direction, "inbound"),
            eq(integrationEvent.externalId, input.externalId),
          ),
        )
        .get();
    if (prior) {
      if (
        prior.payloadJson !== payloadJson ||
        prior.eventType !== input.type ||
        prior.subjectId !== input.subjectId ||
        prior.occurredAt.getTime() !== occurred
      )
        throw new HttpError(409, "conflict", "External event ID was reused");
      await this.requireActiveAppGrant(tokenHash, "events.write", app.id);
      return { id: prior.id, state: prior.state, replayed: true };
    }
    const newer = await this.db
        .select({ id: integrationEvent.id })
        .from(integrationEvent)
        .where(
          and(
            eq(integrationEvent.appId, app.id),
            eq(integrationEvent.direction, "inbound"),
            eq(integrationEvent.eventType, input.type),
            eq(integrationEvent.subjectId, input.subjectId),
            gt(integrationEvent.occurredAt, new Date(occurred)),
          ),
        )
        .limit(1)
        .get(),
      id = crypto.randomUUID(),
      now = new Date(),
      state = newer ? "superseded" : "received",
      guard = crypto.randomUUID();
    try {
      await executeD1Batch(this.db, [
        sql`insert into ${operationConditionGuard} (id,authorized) select ${guard},case when ${activeAppGrant(tokenHash, "events.write", app.id)} then 1 else 0 end`,
        this.db
          .insert(integrationEvent)
          .values({
            id,
            appId: app.id,
            endpointId: null,
            direction: "inbound",
            eventType: input.type,
            subjectId: input.subjectId,
            externalId: input.externalId,
            payloadJson,
            state,
            attempts: 0,
            occurredAt: new Date(occurred),
            nextAttemptAt: null,
            lastError: null,
            createdAt: now,
            updatedAt: now,
          }),
        this.db
          .delete(operationConditionGuard)
          .where(eq(operationConditionGuard.id, guard)),
      ]);
    } catch (error) {
      const raced = await this.db
        .select()
        .from(integrationEvent)
        .where(
          and(
            eq(integrationEvent.appId, app.id),
            eq(integrationEvent.direction, "inbound"),
            eq(integrationEvent.externalId, input.externalId),
          ),
        )
        .get();
      if (
        raced &&
        raced.payloadJson === payloadJson &&
        raced.eventType === input.type &&
        raced.subjectId === input.subjectId &&
        raced.occurredAt.getTime() === occurred
      ) {
        await this.requireActiveAppGrant(tokenHash, "events.write", app.id);
        return { id: raced.id, state: raced.state, replayed: true };
      }
      if (String(error).includes("operation_conflict"))
        throw new HttpError(
          401,
          "authentication_required",
          "App token is invalid or revoked",
        );
      if (raced)
        throw new HttpError(409, "conflict", "External event ID was reused");
      throw error;
    }
    return { id, state, replayed: false };
  }
  async appContacts(token: string, limit = 100) {
    const capped = Math.max(1, Math.min(100, limit));
    return this.authorizedAppRows(
      token,
      "contacts.read",
      this.db
        .select({
          id: contact.id,
          firstName: sql`${contact.firstName}`.as("firstName"),
          lastName: sql`${contact.lastName}`.as("lastName"),
          email: contact.email,
          phone: contact.phone,
          companyId: sql`${contact.companyId}`.as("companyId"),
          updatedAt: sql`${contact.updatedAt}`.as("updatedAt"),
        })
        .from(contact)
        .where(isNull(contact.archivedAt))
        .orderBy(desc(contact.updatedAt), contact.id)
        .limit(capped),
    );
  }
  async appLeads(token: string, limit = 100) {
    const capped = Math.max(1, Math.min(100, limit));
    return this.authorizedAppRows(
      token,
      "leads.read",
      this.db
        .select({
          id: lead.id,
          firstName: sql`${lead.firstName}`.as("firstName"),
          lastName: sql`${lead.lastName}`.as("lastName"),
          email: lead.email,
          phone: lead.phone,
          sourceId: sql`${lead.sourceId}`.as("sourceId"),
          statusId: sql`${lead.statusId}`.as("statusId"),
          ownerMembershipId: sql`${lead.ownerMembershipId}`.as(
            "ownerMembershipId",
          ),
          updatedAt: sql`${lead.updatedAt}`.as("updatedAt"),
        })
        .from(lead)
        .where(isNull(lead.archivedAt))
        .orderBy(desc(lead.updatedAt), lead.id)
        .limit(capped),
    );
  }
  async appCreateLead(token: string, input: AppLeadCreate) {
    const tokenHash = await hash(token),
      app = await this.authorizeApp(token, "leads.create"),
      externalId = `lead.create:${input.operationKey}`,
      prior = await this.db
        .select()
        .from(integrationEvent)
        .where(
          and(
            eq(integrationEvent.appId, app.id),
            eq(integrationEvent.direction, "inbound"),
            eq(integrationEvent.externalId, externalId),
          ),
        )
        .get(),
      fingerprint = JSON.stringify(input);
    if (prior) {
      const stored = JSON.parse(prior.payloadJson) as {
        input: AppLeadCreate;
        recordId: string;
      };
      if (JSON.stringify(stored.input) !== fingerprint)
        throw new HttpError(409, "conflict", "Operation key was already used");
      await this.requireActiveAppGrant(tokenHash, "leads.create", app.id);
      return { id: stored.recordId, replayed: true };
    }
    const id = crypto.randomUUID(),
      guard = crypto.randomUUID(),
      now = new Date(),
      payload = JSON.stringify({ input, recordId: id });
    try {
      await executeD1Batch(this.db, [
        sql`insert into ${operationConditionGuard} (id,authorized) select ${guard},case when ${activeAppGrant(tokenHash, "leads.create", app.id)} and exists(select 1 from module_setting where entity='lead' and enabled=1) then 1 else 0 end`,
        this.db
          .insert(lead)
          .values({
            id,
            firstName: input.firstName,
            lastName: input.lastName ?? null,
            email: input.email?.toLowerCase() ?? null,
            phone: input.phone ?? null,
            normalizedEmail: input.email?.toLowerCase() ?? null,
            normalizedPhone: input.phone?.replace(/[^0-9+]/g, "") ?? null,
            sourceId: input.sourceId,
            statusId: "new",
            creatorUserId: app.authorityMembershipId,
            revision: 0,
            createdAt: now,
            updatedAt: now,
          }),
        this.db
          .insert(integrationEvent)
          .values({
            id: crypto.randomUUID(),
            appId: app.id,
            endpointId: null,
            direction: "inbound",
            eventType: "lead.created",
            subjectId: id,
            externalId,
            payloadJson: payload,
            state: "received",
            attempts: 0,
            occurredAt: now,
            nextAttemptAt: null,
            lastError: null,
            createdAt: now,
            updatedAt: now,
          }),
        this.db
          .delete(operationConditionGuard)
          .where(eq(operationConditionGuard.id, guard)),
      ]);
    } catch (error) {
      const raced = await this.appCommandReplay(
        app.id,
        externalId,
        fingerprint,
      );
      if (raced) {
        await this.requireActiveAppGrant(tokenHash, "leads.create", app.id);
        return { id: raced, replayed: true };
      }
      if (String(error).includes("operation_conflict"))
        throw new HttpError(
          401,
          "authentication_required",
          "App authority or grant is unavailable",
        );
      throw error;
    }
    return { id, replayed: false };
  }
  async appCreateTicket(token: string, input: AppTicketCreate) {
    const tokenHash = await hash(token),
      app = await this.authorizeApp(token, "tickets.create"),
      externalId = `ticket.create:${input.operationKey}`,
      prior = await this.db
        .select()
        .from(integrationEvent)
        .where(
          and(
            eq(integrationEvent.appId, app.id),
            eq(integrationEvent.direction, "inbound"),
            eq(integrationEvent.externalId, externalId),
          ),
        )
        .get(),
      fingerprint = JSON.stringify(input);
    if (prior) {
      const stored = JSON.parse(prior.payloadJson) as {
        input: AppTicketCreate;
        recordId: string;
      };
      if (JSON.stringify(stored.input) !== fingerprint)
        throw new HttpError(409, "conflict", "Operation key was already used");
      await this.requireActiveAppGrant(tokenHash, "tickets.create", app.id);
      return { id: stored.recordId, replayed: true };
    }
    const id = crypto.randomUUID(),
      eventOperationKey = `integration:${app.id}:${externalId}`,
      guard = crypto.randomUUID(),
      now = new Date(),
      payload = JSON.stringify({ input, recordId: id });
    try {
      await executeD1Batch(this.db, [
        sql`insert into ${operationConditionGuard} (id,authorized) select ${guard},case when ${activeAppGrant(tokenHash, "tickets.create", app.id)} then 1 else 0 end`,
        this.db
          .update(ticketSequence)
          .set({ nextNumber: sql`${ticketSequence.nextNumber}+1` })
          .where(eq(ticketSequence.id, "tickets")),
        this.db
          .insert(ticket)
          .values({
            id,
            number: sql`(select ${ticketSequence.nextNumber}-1 from ${ticketSequence} where ${ticketSequence.id}='tickets')`,
            subject: input.subject,
            description: input.description ?? null,
            priority: "normal",
            source: input.source,
            creatorUserId: app.authorityMembershipId,
            status: "open",
            currentCycle: 1,
            revision: 0,
            createdAt: now,
            updatedAt: now,
          }),
        this.db
          .insert(ticketCycle)
          .values({
            ticketId: id,
            cycle: 1,
            openedAt: now,
            openedBy: app.authorityMembershipId,
            overdueBreached: false,
          }),
        this.db
          .insert(ticketEvent)
          .values({
            id: crypto.randomUUID(),
            ticketId: id,
            cycle: 1,
            action: "created",
            actorId: app.authorityMembershipId,
            operationKey: eventOperationKey,
            fingerprint,
            resultJson: JSON.stringify({ id, status: "open", revision: 0 }),
            createdAt: now,
          }),
        this.db
          .insert(integrationEvent)
          .values({
            id: crypto.randomUUID(),
            appId: app.id,
            endpointId: null,
            direction: "inbound",
            eventType: "ticket.created",
            subjectId: id,
            externalId,
            payloadJson: payload,
            state: "received",
            attempts: 0,
            occurredAt: now,
            nextAttemptAt: null,
            lastError: null,
            createdAt: now,
            updatedAt: now,
          }),
        this.db
          .delete(operationConditionGuard)
          .where(eq(operationConditionGuard.id, guard)),
      ]);
    } catch (error) {
      const raced = await this.appCommandReplay(
        app.id,
        externalId,
        fingerprint,
      );
      if (raced) {
        await this.requireActiveAppGrant(tokenHash, "tickets.create", app.id);
        return { id: raced, replayed: true };
      }
      if (String(error).includes("operation_conflict"))
        throw new HttpError(
          401,
          "authentication_required",
          "App authority or grant is unavailable",
        );
      throw error;
    }
    return { id, replayed: false };
  }
  async createEndpoint(context: RequestContext, input: EndpointCreate) {
    await requirePermission(this.db, context, ["integration.manage"], true);
    const secret = crypto.randomUUID() + crypto.randomUUID(),
      id = crypto.randomUUID(),
      now = new Date();
    await authorizedBatch(
      this.db,
      context,
      ["integration.manage"],
      [
        this.db
          .insert(webhookEndpoint)
          .values({
            id,
            name: input.name,
            url: input.url,
            secretCiphertext: await this.webhookSecrets.encrypt(secret),
            eventsJson: JSON.stringify([...new Set(input.events)]),
            active: true,
            revision: 0,
            createdAt: now,
            updatedAt: now,
          }),
      ],
    );
    return { id, secret };
  }
  async disableEndpoint(context: RequestContext, id: string, revision: number) {
    await requirePermission(this.db, context, ["integration.manage"], true);
    const guard = actionGuard(this.db, context, ["integration.manage"], true);
    try {
      const [, rows] = await this.db.batch([
        guard.begin,
        this.db
          .update(webhookEndpoint)
          .set({ active: false, revision: revision + 1, updatedAt: new Date() })
          .where(
            and(
              eq(webhookEndpoint.id, id),
              eq(webhookEndpoint.revision, revision),
              eq(webhookEndpoint.active, true),
            ),
          )
          .returning(),
        guard.end,
      ]);
      if (!rows.length)
        throw new HttpError(
          409,
          "conflict",
          "Endpoint changed or was already disabled",
        );
    } catch (error) {
      permissionError(error);
    }
    return { id, active: false };
  }
  async queue(
    eventType: string,
    subjectId: string,
    externalId: string,
    payload: Record<string, unknown>,
    occurredAt = new Date(),
  ) {
    const endpoints = await this.db
        .select()
        .from(webhookEndpoint)
        .where(eq(webhookEndpoint.active, true)),
      now = new Date(),
      ids: string[] = [];
    for (const endpoint of endpoints) {
      if (!(JSON.parse(endpoint.eventsJson) as string[]).includes(eventType))
        continue;
      const id = crypto.randomUUID(),
        written = await this.db
          .insert(integrationEvent)
          .values({
            id,
            appId: null,
            endpointId: endpoint.id,
            direction: "outbound",
            eventType,
            subjectId,
            externalId,
            payloadJson: JSON.stringify(payload),
            state: "pending",
            attempts: 0,
            occurredAt,
            nextAttemptAt: now,
            lastError: null,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing();
      if (written.meta.changes) ids.push(id);
      else {
        const prior = await this.db
          .select({ id: integrationEvent.id })
          .from(integrationEvent)
          .where(
            and(
              eq(integrationEvent.endpointId, endpoint.id),
              eq(integrationEvent.direction, "outbound"),
              eq(integrationEvent.externalId, externalId),
            ),
          )
          .get();
        if (prior) ids.push(prior.id);
      }
    }
    return ids;
  }
  async emit(
    eventType: string,
    subjectId: string,
    externalId: string,
    payload: Record<string, unknown>,
    depth = 0,
  ) {
    const webhooks = await this.queue(
        eventType,
        subjectId,
        externalId,
        payload,
      ),
      automations = await this.executeAutomation({
        id: externalId,
        type: eventType,
        depth,
        payload,
      });
    return { webhooks, automations };
  }
  private scheduledDueCondition(event: typeof integrationOutbox.$inferSelect) {
    const prefix = `${event.eventType}:${event.subjectId}:`;
    if (
      !event.eventType.endsWith(".due") ||
      !event.externalId.startsWith(prefix)
    )
      return null;
    const dueAt = Number(event.externalId.slice(prefix.length));
    if (!Number.isFinite(dueAt)) return null;
    const current =
      event.eventType === "task.due"
        ? sql`exists(select 1 from ${taskRecord} where ${taskRecord.activityId}=${event.subjectId} and ${taskRecord.completedAt} is null and ${taskRecord.dueAt}=${dueAt})`
        : event.eventType === "ticket.due"
          ? sql`exists(select 1 from ${ticket} where ${ticket.id}=${event.subjectId} and ${ticket.status}='open' and ${ticket.dueAt}=${dueAt})`
          : event.eventType === "appointment.due"
            ? sql`exists(select 1 from ${appointment} where ${appointment.id}=${event.subjectId} and ${appointment.status}='scheduled' and ${appointment.startsAt}=${dueAt})`
            : event.eventType === "contract.due"
              ? sql`exists(select 1 from ${contract} where ${contract.id}=${event.subjectId} and ${contract.status}='active' and ${contract.expiresAt}=${dueAt})`
              : null;
    return current
      ? sql`exists(select 1 from ${scheduledDueFence} where ${scheduledDueFence.outboxId}=${event.id}) or (${current})`
      : null;
  }
  private async fenceScheduledDue(
    event: typeof integrationOutbox.$inferSelect,
    attempts: number,
    now: Date,
  ) {
    const condition = this.scheduledDueCondition(event);
    if (!condition) return !event.eventType.endsWith(".due");
    const guard = crypto.randomUUID();
    try {
      await executeD1Batch(this.db, [
        sql`insert into ${operationConditionGuard} (id,authorized) select ${guard},case when exists(select 1 from ${integrationOutbox} where ${integrationOutbox.id}=${event.id} and ${integrationOutbox.state}='dispatching' and ${integrationOutbox.attempts}=${attempts}) and (${condition}) then 1 else 0 end`,
        this.db
          .insert(scheduledDueFence)
          .values({ outboxId: event.id, fencedAt: now })
          .onConflictDoNothing(),
        this.db
          .delete(operationConditionGuard)
          .where(eq(operationConditionGuard.id, guard)),
      ]);
      return true;
    } catch (error) {
      if (String(error).includes("operation_conflict")) return false;
      throw error;
    }
  }
  async dispatchOutbox(now = new Date()) {
    const due = await this.db
        .select()
        .from(integrationOutbox)
        .where(
          and(
            sql`${integrationOutbox.state} in ('pending','failed','dispatching')`,
            sql`${integrationOutbox.nextAttemptAt}<=${now.getTime()}`,
            sql`${integrationOutbox.attempts}<20 or (${integrationOutbox.state}='dispatching' and ${integrationOutbox.attempts}=20)`,
          ),
        )
        .orderBy(
          integrationOutbox.nextAttemptAt,
          integrationOutbox.createdAt,
          integrationOutbox.externalId,
        )
        .limit(20),
      results = [];
    for (const event of due) {
      const attempts =
          event.state === "dispatching" && event.attempts === 20
            ? 20
            : event.attempts + 1,
        lease = new Date(now.getTime() + 900_000),
        claimed = await this.db
          .update(integrationOutbox)
          .set({
            state: "dispatching",
            attempts,
            nextAttemptAt: lease,
            updatedAt: now,
          })
          .where(
            and(
              eq(integrationOutbox.id, event.id),
              eq(integrationOutbox.state, event.state),
              eq(integrationOutbox.attempts, event.attempts),
              sql`${integrationOutbox.nextAttemptAt}<=${now.getTime()}`,
            ),
          );
      if (!claimed.meta.changes) continue;
      if (!(await this.fenceScheduledDue(event, attempts, now))) {
        await this.db
          .delete(integrationOutbox)
          .where(
            and(
              eq(integrationOutbox.id, event.id),
              eq(integrationOutbox.state, "dispatching"),
              eq(integrationOutbox.attempts, attempts),
            ),
          );
        results.push({ id: event.id, delivered: false });
        continue;
      }
      try {
        const emitted = await this.emit(
          event.eventType,
          event.subjectId,
          event.externalId,
          JSON.parse(event.payloadJson) as Record<string, unknown>,
          event.depth,
        );
        if (emitted.automations.some((item) => item.status === "failed"))
          throw new Error("Automation execution failed");
        await this.db
          .update(integrationOutbox)
          .set({
            state: "delivered",
            nextAttemptAt: null,
            lastError: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(integrationOutbox.id, event.id),
              eq(integrationOutbox.state, "dispatching"),
              eq(integrationOutbox.attempts, attempts),
            ),
          );
        results.push({ id: event.id, delivered: true });
      } catch (error) {
        await this.db
          .update(integrationOutbox)
          .set({
            state: "failed",
            nextAttemptAt:
              attempts >= 20
                ? null
                : new Date(
                    now.getTime() + Math.min(3_600_000, 2 ** attempts * 1000),
                  ),
            lastError:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "Dispatch failed",
            updatedAt: now,
          })
          .where(
            and(
              eq(integrationOutbox.id, event.id),
              eq(integrationOutbox.state, "dispatching"),
              eq(integrationOutbox.attempts, attempts),
            ),
          );
        results.push({ id: event.id, delivered: false });
      }
    }
    return results;
  }
  async rewrapWebhookSecrets(now = new Date()) {
    const prefix = await this.webhookSecrets.currentPrefix();
    const endpoints = await this.db
      .select()
      .from(webhookEndpoint)
      .where(notLike(webhookEndpoint.secretCiphertext, `${prefix}%`))
      .orderBy(webhookEndpoint.updatedAt, webhookEndpoint.id)
      .limit(20);
    let processed = 0,
      failed = 0;
    for (const endpoint of endpoints) {
      try {
        const opened = await this.webhookSecrets.decrypt(
          endpoint.secretCiphertext,
        );
        if (opened.needsRewrap) {
          const changed = await this.db
            .update(webhookEndpoint)
            .set({
              secretCiphertext: await this.webhookSecrets.encrypt(opened.value),
              updatedAt: now,
            })
            .where(
              and(
                eq(webhookEndpoint.id, endpoint.id),
                eq(webhookEndpoint.secretCiphertext, endpoint.secretCiphertext),
              ),
            );
          processed += changed.meta.changes;
        }
      } catch {
        failed++;
        await this.db
          .update(webhookEndpoint)
          .set({ updatedAt: now })
          .where(
            and(
              eq(webhookEndpoint.id, endpoint.id),
              eq(webhookEndpoint.secretCiphertext, endpoint.secretCiphertext),
            ),
          );
      }
    }
    const remaining = await this.db
      .select({ count: count() })
      .from(webhookEndpoint)
      .where(notLike(webhookEndpoint.secretCiphertext, `${prefix}%`))
      .get();
    return { processed, failed, remaining: remaining?.count ?? 0 };
  }
  async deliverDue(transport: WebhookTransport, now = new Date()) {
    const due = await this.db
        .select()
        .from(integrationEvent)
        .where(
          and(
            eq(integrationEvent.direction, "outbound"),
            sql`${integrationEvent.state} in ('pending','failed','delivering')`,
            sql`${integrationEvent.nextAttemptAt}<=${now.getTime()}`,
            sql`${integrationEvent.attempts}<20 or (${integrationEvent.state}='delivering' and ${integrationEvent.attempts}=20)`,
          ),
        )
        .orderBy(
          integrationEvent.nextAttemptAt,
          integrationEvent.occurredAt,
          integrationEvent.externalId,
        )
        .limit(20),
      results = [];
    for (const event of due) {
      const claimed =
          event.state === "delivering" && event.attempts === 20
            ? 20
            : event.attempts + 1,
        lease = new Date(now.getTime() + 900_000),
        claim = await this.db
          .update(integrationEvent)
          .set({
            state: "delivering",
            attempts: claimed,
            nextAttemptAt: lease,
            updatedAt: now,
          })
          .where(
            and(
              eq(integrationEvent.id, event.id),
              eq(integrationEvent.state, event.state),
              eq(integrationEvent.attempts, event.attempts),
              sql`${integrationEvent.nextAttemptAt}<=${now.getTime()}`,
            ),
          );
      if (!claim.meta.changes) continue;
      const endpoint = await this.db
        .select()
        .from(webhookEndpoint)
        .where(
          and(
            eq(webhookEndpoint.id, event.endpointId!),
            eq(webhookEndpoint.active, true),
          ),
        )
        .get();
      if (!endpoint) {
        await this.db
          .update(integrationEvent)
          .set({
            state: "failed",
            nextAttemptAt: null,
            lastError: "Endpoint disabled",
            updatedAt: now,
          })
          .where(
            and(
              eq(integrationEvent.id, event.id),
              eq(integrationEvent.state, "delivering"),
              eq(integrationEvent.attempts, claimed),
            ),
          );
        continue;
      }
      const body = JSON.stringify({
          id: event.externalId,
          type: event.eventType,
          subjectId: event.subjectId,
          occurredAt: event.occurredAt.toISOString(),
          payload: JSON.parse(event.payloadJson),
        }),
        timestamp = String(now.getTime());
      try {
        const opened = await this.webhookSecrets.decrypt(
          endpoint.secretCiphertext,
        );
        if (opened.needsRewrap)
          await this.db
            .update(webhookEndpoint)
            .set({
              secretCiphertext: await this.webhookSecrets.encrypt(opened.value),
              updatedAt: now,
            })
            .where(
              and(
                eq(webhookEndpoint.id, endpoint.id),
                eq(webhookEndpoint.secretCiphertext, endpoint.secretCiphertext),
              ),
            );
        const sent = await transport.send({
            url: endpoint.url,
            headers: new Headers({
              "content-type": "application/json",
              "x-crm-delivery-id": event.id,
              "x-crm-timestamp": timestamp,
              "x-crm-signature": await hmac(
                opened.value,
                `${timestamp}.${body}`,
              ),
            }),
            body,
          }),
          delivered = sent.status >= 200 && sent.status < 300,
          next =
            delivered || claimed >= 20
              ? null
              : new Date(
                  now.getTime() + Math.min(3_600_000, 2 ** claimed * 1000),
                );
        await this.db
          .update(integrationEvent)
          .set({
            state: delivered ? "delivered" : "failed",
            nextAttemptAt: next,
            lastError: delivered ? null : `HTTP ${sent.status}`,
            updatedAt: now,
          })
          .where(
            and(
              eq(integrationEvent.id, event.id),
              eq(integrationEvent.state, "delivering"),
              eq(integrationEvent.attempts, claimed),
            ),
          );
        results.push({ id: event.id, delivered });
      } catch (error) {
        await this.db
          .update(integrationEvent)
          .set({
            state: "failed",
            nextAttemptAt:
              claimed >= 20
                ? null
                : new Date(
                    now.getTime() + Math.min(3_600_000, 2 ** claimed * 1000),
                  ),
            lastError:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "Delivery failed",
            updatedAt: now,
          })
          .where(
            and(
              eq(integrationEvent.id, event.id),
              eq(integrationEvent.state, "delivering"),
              eq(integrationEvent.attempts, claimed),
            ),
          );
        results.push({ id: event.id, delivered: false });
      }
    }
    return results;
  }
  async createTemplate(context: RequestContext, input: TemplateCreate) {
    await requirePermission(this.db, context, ["template.manage"], true);
    const id = crypto.randomUUID(),
      now = new Date();
    await authorizedBatch(
      this.db,
      context,
      ["template.manage"],
      [
        this.db
          .insert(emailTemplate)
          .values({
            id,
            name: input.name,
            subject: input.subject,
            body: input.body,
            requiredVariablesJson: JSON.stringify([
              ...new Set(input.requiredVariables),
            ]),
            revision: 0,
            createdAt: now,
            updatedAt: now,
          }),
      ],
    );
    return { id };
  }
  async previewTemplate(
    context: RequestContext,
    id: string,
    variables: Record<string, string>,
  ) {
    await requirePermission(this.db, context, ["template.manage"], true);
    const template = await this.db
      .select()
      .from(emailTemplate)
      .where(eq(emailTemplate.id, id))
      .get();
    if (!template)
      throw new HttpError(404, "not_found", "Template was not found");
    const required = JSON.parse(template.requiredVariablesJson) as string[],
      missing = required.filter((key) => !variables[key]);
    if (missing.length)
      throw new HttpError(
        400,
        "validation_failed",
        `Missing variables: ${missing.join(", ")}`,
      );
    const render = (value: string) =>
      value.replace(
        /{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g,
        (_, key: string) => variables[key] ?? "",
      );
    return {
      subject: render(template.subject),
      body: render(template.body),
      missing: [],
    };
  }
  async createAutomation(context: RequestContext, input: AutomationCreate) {
    await requirePermission(this.db, context, ["automation.manage"], true);
    if ("membershipId" in input.action) {
      const member = await this.db
        .select({ userId: singletonMembership.userId })
        .from(singletonMembership)
        .where(
          and(
            eq(singletonMembership.userId, input.action.membershipId),
            eq(singletonMembership.status, "active"),
          ),
        )
        .get();
      if (!member)
        throw new HttpError(
          400,
          "validation_failed",
          "Automation target must be active",
        );
    }
    if (
      input.action.type === "send-email" &&
      !(await this.db
        .select()
        .from(emailTemplate)
        .where(eq(emailTemplate.id, input.action.templateId))
        .get())
    )
      throw new HttpError(
        400,
        "validation_failed",
        "Email template was not found",
      );
    const id = crypto.randomUUID(),
      now = new Date();
    await authorizedBatch(
      this.db,
      context,
      ["automation.manage"],
      [
        this.db
          .insert(automationRule)
          .values({
            id,
            name: input.name,
            eventType: input.eventType,
            conditionJson: JSON.stringify(input.condition),
            actionJson: JSON.stringify(input.action),
            enabled: input.enabled,
            authorityMembershipId: context.membershipId,
            maxDepth: input.maxDepth,
            revision: 0,
            createdAt: now,
            updatedAt: now,
          }),
      ],
    );
    return { id };
  }
  async setAutomationEnabled(
    context: RequestContext,
    id: string,
    revision: number,
    enabled: boolean,
  ) {
    await requirePermission(this.db, context, ["automation.manage"], true);
    const guard = actionGuard(this.db, context, ["automation.manage"], true);
    try {
      const [, rows] = await this.db.batch([
        guard.begin,
        this.db
          .update(automationRule)
          .set({ enabled, revision: revision + 1, updatedAt: new Date() })
          .where(
            and(
              eq(automationRule.id, id),
              eq(automationRule.revision, revision),
            ),
          )
          .returning(),
        guard.end,
      ]);
      if (!rows.length)
        throw new HttpError(
          409,
          "conflict",
          "Automation changed before saving",
        );
    } catch (error) {
      permissionError(error);
    }
    return { id, enabled, revision: revision + 1 };
  }
  async executeAutomation(event: {
    id: string;
    type: string;
    depth: number;
    payload: Record<string, unknown>;
  }) {
    const rules = await this.db
        .select()
        .from(automationRule)
        .where(
          and(
            eq(automationRule.enabled, true),
            eq(automationRule.eventType, event.type),
          ),
        ),
      results = [];
    for (const rule of rules) {
      const condition = JSON.parse(rule.conditionJson) as {
          field: string;
          equals: unknown;
        },
        action = JSON.parse(rule.actionJson) as AutomationAction,
        now = new Date(),
        stale = new Date(now.getTime() - 900_000);
      let runId = crypto.randomUUID(),
        attempts = 1,
        claimed = await this.db
          .insert(automationRun)
          .values({
            id: runId,
            ruleId: rule.id,
            eventId: event.id,
            depth: Math.min(event.depth, 5),
            status: "processing",
            resultJson: "{}",
            error: null,
            attempts,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing();
      if (!claimed.meta.changes) {
        const prior = await this.db
          .select()
          .from(automationRun)
          .where(
            and(
              eq(automationRun.ruleId, rule.id),
              eq(automationRun.eventId, event.id),
            ),
          )
          .get();
        if (!prior) {
          results.push({
            ruleId: rule.id,
            status: "failed" as const,
            replayed: true,
          });
          continue;
        }
        if (
          (prior.status === "failed" ||
            (prior.status === "processing" && prior.updatedAt <= stale)) &&
          prior.attempts < 20
        ) {
          runId = prior.id;
          attempts = prior.attempts + 1;
          claimed = await this.db
            .update(automationRun)
            .set({
              status: "processing",
              attempts,
              error: null,
              updatedAt: now,
            })
            .where(
              and(
                eq(automationRun.id, prior.id),
                eq(automationRun.status, prior.status),
                eq(automationRun.attempts, prior.attempts),
              ),
            );
        }
        if (!claimed.meta.changes) {
          results.push({
            ruleId: rule.id,
            status: prior.status,
            replayed: true,
          });
          continue;
        }
      }
      let status: "completed" | "skipped" = "skipped",
        result: Record<string, unknown> = { reason: "condition" };
      try {
        if (event.depth >= rule.maxDepth) result = { reason: "loop_cap" };
        else if (event.payload[condition.field] === condition.equals) {
          const authority = await this.authorityContext(
            rule.authorityMembershipId,
            event.id,
          );
          if (action.type === "set-lead-owner") {
            const leadId = String(event.payload[action.leadIdField] ?? "");
            result = { leadId, ownerMembershipId: action.membershipId };
            status = "completed";
            const guard = actionGuard(
              this.db,
              authority,
              ["lead.assign"],
              false,
              sql`exists(select 1 from lead where id=${leadId}) and exists(select 1 from singleton_membership where user_id=${action.membershipId} and status='active')`,
            );
            await this.db.batch([
              guard.begin,
              this.db
                .update(lead)
                .set({
                  ownerMembershipId: action.membershipId,
                  revision: sql`case when ${lead.ownerMembershipId} is ${action.membershipId} then ${lead.revision} else ${lead.revision}+1 end`,
                  updatedAt: now,
                })
                .where(eq(lead.id, leadId)),
              this.db
                .update(automationRun)
                .set({
                  status,
                  resultJson: JSON.stringify(result),
                  error: null,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(automationRun.id, runId),
                    eq(automationRun.status, "processing"),
                    eq(automationRun.attempts, attempts),
                  ),
                ),
              guard.end,
            ]);
          } else if (action.type === "update-lead-field") {
            const leadId = String(event.payload[action.leadIdField] ?? "");
            result = { leadId, field: action.field };
            status = "completed";
            const guard = actionGuard(
              this.db,
              authority,
              ["lead.update"],
              false,
              sql`exists(select 1 from lead where id=${leadId})`,
            );
            const revisionFor = (
              column:
                | typeof lead.title
                | typeof lead.description
                | typeof lead.statusId
                | typeof lead.sourceId,
            ) =>
              sql`case when ${column} is ${action.value} then ${lead.revision} else ${lead.revision}+1 end`;
            const update =
              action.field === "title"
                ? this.db
                    .update(lead)
                    .set({
                      title: action.value,
                      revision: revisionFor(lead.title),
                      updatedAt: now,
                    })
                    .where(eq(lead.id, leadId))
                : action.field === "description"
                  ? this.db
                      .update(lead)
                      .set({
                        description: action.value,
                        revision: revisionFor(lead.description),
                        updatedAt: now,
                      })
                      .where(eq(lead.id, leadId))
                  : action.field === "status_id"
                    ? this.db
                        .update(lead)
                        .set({
                          statusId: action.value,
                          revision: revisionFor(lead.statusId),
                          updatedAt: now,
                        })
                        .where(eq(lead.id, leadId))
                    : this.db
                        .update(lead)
                        .set({
                          sourceId: action.value,
                          revision: revisionFor(lead.sourceId),
                          updatedAt: now,
                        })
                        .where(eq(lead.id, leadId));
            const finish = this.db
              .update(automationRun)
              .set({
                status,
                resultJson: JSON.stringify(result),
                error: null,
                updatedAt: now,
              })
              .where(
                and(
                  eq(automationRun.id, runId),
                  eq(automationRun.status, "processing"),
                  eq(automationRun.attempts, attempts),
                ),
              );
            await executeD1Batch(this.db, [
              guard.begin,
              update,
              finish,
              guard.end,
            ]);
          } else if (action.type === "create-task") {
            const leadId = String(event.payload[action.leadIdField] ?? ""),
              taskId = runId,
              dueAt = new Date(
                now.getTime() + action.dueOffsetMinutes * 60_000,
              );
            result = { taskId, leadId };
            status = "completed";
            const guard = actionGuard(
              this.db,
              authority,
              ["task.create"],
              false,
              sql`exists(select 1 from lead where id=${leadId}) and exists(select 1 from singleton_membership where user_id=${action.membershipId} and status='active')`,
            );
            await this.db.batch([
              guard.begin,
              this.db
                .insert(activity)
                .values({
                  id: taskId,
                  type: "task",
                  subject: action.subject,
                  content: null,
                  occurredAt: now,
                  dueAt,
                  completedAt: null,
                  companyId: null,
                  contactId: null,
                  dealId: null,
                  leadId,
                  productId: null,
                  orderId: null,
                  authorUserId: authority.userId,
                  metadataJson: null,
                  createdAt: now,
                  updatedAt: now,
                }),
              this.db
                .insert(taskRecord)
                .values({
                  activityId: taskId,
                  assigneeMembershipId: action.membershipId,
                  currentCycle: 1,
                  dueAt,
                  completedAt: null,
                  overdueBreached: false,
                  revision: 0,
                  createdAt: now,
                  updatedAt: now,
                }),
              this.db
                .insert(taskCycle)
                .values({
                  taskId,
                  cycle: 1,
                  openedAt: now,
                  openedBy: authority.userId,
                  dueAt,
                  completedAt: null,
                  overdueBreached: false,
                  reopenReason: null,
                }),
              this.db
                .update(lead)
                .set({
                  lastActivityAt: sql`max(coalesce(${lead.lastActivityAt},0),${now.getTime()})`,
                  updatedAt: now,
                })
                .where(eq(lead.id, leadId)),
              this.db
                .update(automationRun)
                .set({
                  status,
                  resultJson: JSON.stringify(result),
                  error: null,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(automationRun.id, runId),
                    eq(automationRun.status, "processing"),
                    eq(automationRun.attempts, attempts),
                  ),
                ),
              guard.end,
            ]);
          } else if (action.type === "notify-internal") {
            const subjectId = String(
                event.payload[action.subjectIdField] ?? "",
              ),
              notificationId = crypto.randomUUID();
            result = { notificationId, subjectId };
            status = "completed";
            const guard = actionGuard(
              this.db,
              authority,
              ["integration.manage"],
              true,
              sql`exists(select 1 from singleton_membership where user_id=${action.membershipId} and status='active')`,
            );
            await this.db.batch([
              guard.begin,
              this.db
                .insert(notification)
                .values({
                  id: notificationId,
                  recipientMembershipId: action.membershipId,
                  kind: "automation",
                  sourceId: subjectId,
                  sourceRevision: 0,
                  dueAt: now,
                  title: action.title,
                  body: action.body ?? null,
                  targetUrl: `/leads/${subjectId}`,
                  dedupeKey: `automation:${rule.id}:${event.id}:${action.membershipId}`,
                  state: "pending",
                  attempts: 0,
                  nextAttemptAt: now,
                  lastError: null,
                  browserDeliveredAt: null,
                  readAt: null,
                  createdAt: now,
                  updatedAt: now,
                })
                .onConflictDoNothing(),
              this.db
                .update(automationRun)
                .set({
                  status,
                  resultJson: JSON.stringify(result),
                  error: null,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(automationRun.id, runId),
                    eq(automationRun.status, "processing"),
                    eq(automationRun.attempts, attempts),
                  ),
                ),
              guard.end,
            ]);
          } else if (action.type === "emit-webhook") {
            await requirePermission(
              this.db,
              authority,
              ["integration.manage"],
              true,
            );
            const subjectId = String(
              event.payload[action.subjectIdField] ?? "",
            );
            await this.queue(
              action.eventType,
              subjectId,
              `automation:${rule.id}:${event.id}`,
              { ...event.payload, automationRuleId: rule.id },
              now,
            );
            result = { subjectId, eventType: action.eventType };
            status = "completed";
          } else
            throw new HttpError(
              409,
              "conflict",
              "Email automation is disabled until a delivery channel is configured",
            );
        }
        if (action.type === "emit-webhook" || status === "skipped")
          await this.db
            .update(automationRun)
            .set({
              status,
              resultJson: JSON.stringify(result),
              error: null,
              updatedAt: now,
            })
            .where(
              and(
                eq(automationRun.id, runId),
                eq(automationRun.status, "processing"),
                eq(automationRun.attempts, attempts),
              ),
            );
        results.push({ ruleId: rule.id, status, replayed: false, ...result });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Automation failed";
        await this.db
          .update(automationRun)
          .set({
            status: "failed",
            error: message,
            resultJson: JSON.stringify({ reason: "execution_failed" }),
            updatedAt: now,
          })
          .where(
            and(
              eq(automationRun.id, runId),
              eq(automationRun.status, "processing"),
              eq(automationRun.attempts, attempts),
            ),
          );
        results.push({
          ruleId: rule.id,
          status: "failed" as const,
          replayed: false,
          error: message,
        });
      }
    }
    return results;
  }
  private async authorityContext(membershipId: string, requestId: string) {
    const row = await this.db
      .select({
        userId: singletonMembership.userId,
        role: singletonMembership.role,
        name: user.name,
        email: user.email,
      })
      .from(singletonMembership)
      .innerJoin(user, eq(user.id, singletonMembership.userId))
      .where(
        and(
          eq(singletonMembership.userId, membershipId),
          eq(singletonMembership.status, "active"),
        ),
      )
      .get();
    if (!row)
      throw new HttpError(
        403,
        "permission_required",
        "Automation authority is inactive",
      );
    return {
      userId: row.userId,
      membershipId: row.userId,
      role: row.role,
      user: { name: row.name, email: row.email },
      requestId,
    } as RequestContext;
  }
  async createSegment(context: RequestContext, input: SegmentCreate) {
    await requirePermission(this.db, context, ["segment.manage"], true);
    if (input.kind === "dynamic" && !input.filter)
      throw new HttpError(
        400,
        "validation_failed",
        "Dynamic segments require a filter",
      );
    if (input.kind === "dynamic" && input.memberIds.length)
      throw new HttpError(
        400,
        "validation_failed",
        "Dynamic segments cannot contain static members",
      );
    const id = crypto.randomUUID(),
      now = new Date();
    await authorizedBatch(
      this.db,
      context,
      ["segment.manage"],
      [
        this.db
          .insert(customerSegment)
          .values({
            id,
            name: input.name,
            entity: input.entity,
            kind: input.kind,
            filterJson: JSON.stringify(input.filter ?? {}),
            revision: 0,
            createdAt: now,
            updatedAt: now,
          }),
        ...input.memberIds.map((recordId) =>
          this.db
            .insert(customerSegmentMember)
            .values({ segmentId: id, recordId, addedAt: now }),
        ),
      ],
    );
    return { id };
  }
  async segmentMembers(context: RequestContext, id: string) {
    await requirePermission(this.db, context, ["segment.manage"], true);
    const segment = await this.db
      .select()
      .from(customerSegment)
      .where(eq(customerSegment.id, id))
      .get();
    if (!segment)
      throw new HttpError(404, "not_found", "Segment was not found");
    if (segment.kind === "static")
      return (
        await this.db
          .select()
          .from(customerSegmentMember)
          .where(eq(customerSegmentMember.segmentId, id))
      ).map((row) => row.recordId);
    const filter = JSON.parse(segment.filterJson) as {
      field: string;
      equals: string;
    };
    let query: PromiseLike<{ id: string }[]>;
    if (segment.entity === "lead" && filter.field === "status")
      query = this.db
        .select({ id: lead.id })
        .from(lead)
        .where(and(eq(lead.statusId, filter.equals), isNull(lead.archivedAt)))
        .orderBy(lead.id)
        .limit(10000);
    else if (segment.entity === "lead" && filter.field === "source")
      query = this.db
        .select({ id: lead.id })
        .from(lead)
        .where(and(eq(lead.sourceId, filter.equals), isNull(lead.archivedAt)))
        .orderBy(lead.id)
        .limit(10000);
    else if (segment.entity === "lead" && filter.field === "owner")
      query = this.db
        .select({ id: lead.id })
        .from(lead)
        .where(
          and(
            eq(lead.ownerMembershipId, filter.equals),
            isNull(lead.archivedAt),
          ),
        )
        .orderBy(lead.id)
        .limit(10000);
    else if (segment.entity === "contact" && filter.field === "owner")
      query = this.db
        .select({ id: contact.id })
        .from(contact)
        .where(
          and(
            eq(contact.ownerMembershipId, filter.equals),
            isNull(contact.archivedAt),
          ),
        )
        .orderBy(contact.id)
        .limit(10000);
    else if (segment.entity === "company" && filter.field === "country")
      query = this.db
        .select({ id: company.id })
        .from(company)
        .where(
          and(
            eq(company.countryCode, filter.equals),
            isNull(company.archivedAt),
          ),
        )
        .orderBy(company.id)
        .limit(10000);
    else if (segment.entity === "company" && filter.field === "owner")
      query = this.db
        .select({ id: company.id })
        .from(company)
        .where(
          and(
            eq(company.ownerMembershipId, filter.equals),
            isNull(company.archivedAt),
          ),
        )
        .orderBy(company.id)
        .limit(10000);
    else if (segment.entity === "deal" && filter.field === "stage")
      query = this.db
        .select({ id: deal.id })
        .from(deal)
        .where(and(eq(deal.stageId, filter.equals), isNull(deal.archivedAt)))
        .orderBy(deal.id)
        .limit(10000);
    else if (segment.entity === "deal" && filter.field === "owner")
      query = this.db
        .select({ id: deal.id })
        .from(deal)
        .where(
          and(
            eq(deal.ownerMembershipId, filter.equals),
            isNull(deal.archivedAt),
          ),
        )
        .orderBy(deal.id)
        .limit(10000);
    else
      throw new HttpError(
        400,
        "validation_failed",
        "Filter is not supported for this entity",
      );
    return (await query).map((row) => row.id);
  }
  private async appCommandReplay(
    appId: string,
    externalId: string,
    fingerprint: string,
  ) {
    const event = await this.db
      .select()
      .from(integrationEvent)
      .where(
        and(
          eq(integrationEvent.appId, appId),
          eq(integrationEvent.direction, "inbound"),
          eq(integrationEvent.externalId, externalId),
        ),
      )
      .get();
    if (!event) return null;
    const stored = JSON.parse(event.payloadJson) as {
      input: unknown;
      recordId: string;
    };
    if (JSON.stringify(stored.input) !== fingerprint)
      throw new HttpError(409, "conflict", "Operation key was already used");
    return stored.recordId;
  }
  private async touchApp(tokenHash: string) {
    const now = new Date();
    await this.db
      .update(integrationApp)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(integrationApp.tokenHash, tokenHash),
          eq(integrationApp.status, "active"),
          sql`${integrationApp.lastUsedAt} IS NULL OR ${integrationApp.lastUsedAt}<${now.getTime() - 300_000}`,
        ),
      );
  }
  private async requireActiveAppGrant(
    tokenHash: string,
    grant: string,
    appId: string,
  ) {
    const guard = crypto.randomUUID();
    try {
      await executeD1Batch(this.db, [
        sql`insert into ${operationConditionGuard} (id,authorized) select ${guard},case when ${activeAppGrant(tokenHash, grant, appId)} then 1 else 0 end`,
        sql`select 1`,
        this.db
          .delete(operationConditionGuard)
          .where(eq(operationConditionGuard.id, guard)),
      ]);
    } catch (error) {
      if (String(error).includes("operation_conflict"))
        throw new HttpError(
          401,
          "authentication_required",
          "App token or grant is invalid",
        );
      throw error;
    }
  }
  private async authorizedAppRows(
    token: string,
    grant: string,
    query: DrizzleD1Query,
  ) {
    const tokenHash = await hash(token),
      guard = crypto.randomUUID();
    try {
      const [, rows] = await executeD1Batch(this.db, [
        sql`insert into ${operationConditionGuard} (id,authorized) select ${guard},case when ${activeAppGrant(tokenHash, grant)} then 1 else 0 end`,
        query,
        this.db
          .delete(operationConditionGuard)
          .where(eq(operationConditionGuard.id, guard)),
      ]);
      await this.touchApp(tokenHash);
      return rows.results;
    } catch (error) {
      if (String(error).includes("operation_conflict"))
        throw new HttpError(
          401,
          "authentication_required",
          "App token or grant is invalid",
        );
      throw error;
    }
  }
  private async authorizeApp(token: string, grant: string) {
    const tokenHash = await hash(token),
      app = await this.db
        .select()
        .from(integrationApp)
        .where(
          and(
            eq(integrationApp.tokenHash, tokenHash),
            eq(integrationApp.status, "active"),
            sql`exists(select 1 from ${singletonMembership} where ${singletonMembership.userId}=${integrationApp.authorityMembershipId} and ${singletonMembership.status}='active')`,
          ),
        )
        .get();
    if (!app || !(JSON.parse(app.grantsJson) as string[]).includes(grant))
      throw new HttpError(
        401,
        "authentication_required",
        "App token or grant is invalid",
      );
    await this.touchApp(tokenHash);
    return app;
  }
  async aiStatus(context: RequestContext) {
    await requirePermission(this.db, context);
    return this.db.select().from(aiSetting).get();
  }
  async useAi(context: RequestContext) {
    await requirePermission(this.db, context, ["ai.use"]);
    const setting = await this.db.select().from(aiSetting).get();
    if (
      !setting?.enabled ||
      !setting.provider ||
      setting.monthlyBudgetMinor <= setting.usedMinor
    )
      throw new HttpError(
        409,
        "conflict",
        "AI is disabled until a provider and positive budget are configured",
      );
    throw new HttpError(
      409,
      "conflict",
      "No AI provider adapter is configured",
    );
  }
}
