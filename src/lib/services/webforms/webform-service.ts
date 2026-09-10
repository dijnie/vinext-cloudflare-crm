import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { executeD1Batch, type AppDatabase } from "@/lib/db/database";
import {
  lead,
  leadSource,
  operationConditionGuard,
  ticket,
  ticketCycle,
  ticketEvent,
  ticketSequence,
  webformConfig,
  webformRateBucket,
  webformSubmission,
} from "@/lib/db/schema";
import type { RequestContext } from "@/lib/http/request-context";
import { HttpError } from "@/lib/http/http-errors";
import {
  actionGuard,
  authorizedBatch,
  permissionError,
  requirePermission,
} from "../permissions/permission-policy";
import { normalizeEmail } from "../shared/service-utils";
import { normalizeLeadPhone } from "../leads/lead-normalization";
import type { WebformCreate, WebformUpdate } from "./webform-contract";

const encoder = new TextEncoder();
type BatchQuery = Parameters<typeof executeD1Batch>[1][number];
async function digest(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++)
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}
function stable(value: Record<string, unknown>) {
  return JSON.stringify(
    Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>(
        (out, key) => ((out[key] = value[key]), out),
        {},
      ),
  );
}
function text(value: unknown, max: number) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result ? result.slice(0, max) : null;
}

export class WebformService {
  constructor(private readonly db: AppDatabase) {}
  async list(context: RequestContext) {
    await requirePermission(this.db, context, ["webform.manage"], true);
    return this.db.select().from(webformConfig).orderBy(webformConfig.name);
  }
  async create(context: RequestContext, input: WebformCreate) {
    await requirePermission(this.db, context, ["webform.manage"], true);
    this.validateMapping(input);
    if (
      input.entity === "lead" &&
      !(await this.db
        .select({ id: leadSource.id })
        .from(leadSource)
        .where(
          and(
            eq(leadSource.id, input.source),
            sql`${leadSource.archivedAt} is null`,
          ),
        )
        .get())
    )
      throw new HttpError(
        400,
        "validation_failed",
        "Lead source is unavailable",
      );
    const id = crypto.randomUUID(),
      token =
        input.mode === "signed_system"
          ? crypto.randomUUID() + crypto.randomUUID()
          : null,
      now = new Date();
    await authorizedBatch(
      this.db,
      context,
      ["webform.manage"],
      [
        this.db
          .insert(webformConfig)
          .values({
            id,
            name: input.name,
            slug: input.slug,
            entity: input.entity,
            mode: input.mode,
            tokenHash: token ? await digest(token) : null,
            source: input.source,
            authorityMembershipId: context.membershipId,
            mappingJson: JSON.stringify(input.mapping),
            allowMissingRequired:
              input.mode === "signed_system" && input.allowMissingRequired,
            rateLimitHour: input.rateLimitHour,
            active: true,
            revision: 0,
            createdAt: now,
            updatedAt: now,
          }),
      ],
    );
    return { id, token, revision: 0 };
  }
  async update(context: RequestContext, input: WebformUpdate) {
    await requirePermission(this.db, context, ["webform.manage"], true);
    this.validateMapping(input);
    const current = await this.db
      .select()
      .from(webformConfig)
      .where(eq(webformConfig.id, input.id))
      .get();
    if (!current || current.revision !== input.expectedRevision)
      throw new HttpError(409, "conflict", "Webform changed before saving");
    if (current.mode !== input.mode || current.entity !== input.entity)
      throw new HttpError(
        400,
        "validation_failed",
        "Webform mode and record type are immutable; create a new form to rotate credentials",
      );
    if (
      input.entity === "lead" &&
      !(await this.db
        .select({ id: leadSource.id })
        .from(leadSource)
        .where(
          and(
            eq(leadSource.id, input.source),
            sql`${leadSource.archivedAt} is null`,
          ),
        )
        .get())
    )
      throw new HttpError(
        400,
        "validation_failed",
        "Lead source is unavailable",
      );
    const guard = actionGuard(this.db, context, ["webform.manage"], true);
    try {
      const [, rows] = await this.db.batch([
        guard.begin,
        this.db
          .update(webformConfig)
          .set({
            name: input.name,
            slug: input.slug,
            source: input.source,
            mappingJson: JSON.stringify(input.mapping),
            allowMissingRequired: input.allowMissingRequired,
            rateLimitHour: input.rateLimitHour,
            active: input.active,
            revision: input.expectedRevision + 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(webformConfig.id, input.id),
              eq(webformConfig.revision, input.expectedRevision),
            ),
          )
          .returning(),
        guard.end,
      ]);
      if (!rows.length)
        throw new HttpError(409, "conflict", "Webform changed before saving");
    } catch (error) {
      permissionError(error);
    }
    return { id: input.id, revision: input.expectedRevision + 1 };
  }
  async submit(
    slug: string,
    payload: Record<string, unknown>,
    headers: Headers,
    rawBody: string,
    now = new Date(),
  ) {
    const form = await this.db
      .select()
      .from(webformConfig)
      .where(eq(webformConfig.slug, slug))
      .get();
    if (!form || !form.active)
      throw new HttpError(404, "not_found", "Webform was not found");
    const submissionKey = headers.get("idempotency-key")?.trim();
    if (!submissionKey || submissionKey.length > 255)
      throw new HttpError(
        400,
        "validation_failed",
        "Idempotency-Key is required",
      );
    if (form.mode === "signed_system")
      await this.verifySystem(form.tokenHash!, headers, rawBody, now);
    const fingerprint = await digest(stable(payload)),
      prior = await this.db
        .select({
          fingerprint: webformSubmission.fingerprint,
          recordId: webformSubmission.recordId,
          missingFieldsJson: webformSubmission.missingFieldsJson,
        })
        .from(webformSubmission)
        .where(
          and(
            eq(webformSubmission.formId, form.id),
            eq(webformSubmission.submissionKey, submissionKey),
          ),
        )
        .get();
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new HttpError(409, "conflict", "Submission key was already used");
      return {
        recordId: prior.recordId,
        replayed: true,
        missingFields: JSON.parse(prior.missingFieldsJson) as string[],
        entity: form.entity,
        source: form.source,
      };
    }
    const mapping = JSON.parse(form.mappingJson) as Record<string, string>,
      mapped: Record<string, unknown> = {};
    for (const [input, target] of Object.entries(mapping))
      if (payload[input] !== undefined) mapped[target] = payload[input];
    const required = form.entity === "lead" ? ["firstName"] : ["subject"],
      missing = required.filter((key) => !text(mapped[key], 300));
    if (
      missing.length &&
      !(form.mode === "signed_system" && form.allowMissingRequired)
    )
      throw new HttpError(
        400,
        "validation_failed",
        `Missing required fields: ${missing.join(", ")}`,
      );
    const mappedEmail = text(mapped.email, 320);
    if (
      form.entity === "lead" &&
      mappedEmail &&
      !z.email().safeParse(mappedEmail).success
    )
      throw new HttpError(400, "validation_failed", "Mapped email is invalid");
    const recordId = crypto.randomUUID(),
      client = headers.get("cf-connecting-ip") ?? "unknown",
      clientHash = await digest(client),
      bucket = Math.floor(now.getTime() / 3_600_000),
      guardId = crypto.randomUUID();
    const statements: BatchQuery[] = [
      this.db
        .insert(webformRateBucket)
        .values({ formId: form.id, bucket, clientHash, count: 1 })
        .onConflictDoUpdate({
          target: [
            webformRateBucket.formId,
            webformRateBucket.bucket,
            webformRateBucket.clientHash,
          ],
          set: { count: sql`${webformRateBucket.count}+1` },
        }),
      sql`insert into ${operationConditionGuard} (id,authorized) select ${guardId},case when exists(select 1 from webform_config f join singleton_membership m on m.user_id=f.authority_membership_id where f.id=${form.id} and f.active=1 and (${form.entity}!='lead' or exists(select 1 from module_setting where entity='lead' and enabled=1)) and m.status='active' and (m.role='owner' or exists(select 1 from membership_access ma join access_grant g on g.profile_id=ma.profile_id where ma.membership_id=m.user_id and g.permission=${form.entity === "lead" ? "lead.create" : "ticket.create"}))) and (select count from ${webformRateBucket} where ${webformRateBucket.formId}=${form.id} and ${webformRateBucket.bucket}=${bucket} and ${webformRateBucket.clientHash}=${clientHash})<=${form.rateLimitHour} then 1 else 0 end`,
    ];
    if (form.entity === "lead")
      statements.push(
        this.db
          .insert(lead)
          .values({
            id: recordId,
            firstName: text(mapped.firstName, 200) ?? "[missing:firstName]",
            lastName: text(mapped.lastName, 200),
            email: mappedEmail,
            phone: text(mapped.phone, 80),
            normalizedEmail: normalizeEmail(mappedEmail),
            normalizedPhone: normalizeLeadPhone(text(mapped.phone, 80)),
            title: text(mapped.title, 200),
            description: text(mapped.description, 10000),
            sourceId: form.source,
            statusId: "new",
            ownerMembershipId: form.authorityMembershipId,
            creatorUserId: form.authorityMembershipId,
            revision: 0,
            createdAt: now,
            updatedAt: now,
          }),
      );
    else
      statements.push(
        this.db
          .update(ticketSequence)
          .set({ nextNumber: sql`${ticketSequence.nextNumber}+1` })
          .where(eq(ticketSequence.id, "tickets")),
        this.db
          .insert(ticket)
          .values({
            id: recordId,
            number: sql`(select ${ticketSequence.nextNumber}-1 from ${ticketSequence} where ${ticketSequence.id}='tickets')`,
            subject: text(mapped.subject, 300) ?? "[missing:subject]",
            description: text(mapped.description, 10000),
            priority: ["low", "normal", "high", "urgent"].includes(
              String(mapped.priority),
            )
              ? (String(mapped.priority) as
                  "low" | "normal" | "high" | "urgent")
              : "normal",
            category: text(mapped.category, 120),
            source: form.source,
            creatorUserId: form.authorityMembershipId,
            status: "open",
            currentCycle: 1,
            revision: 0,
            createdAt: now,
            updatedAt: now,
          }),
        this.db
          .insert(ticketCycle)
          .values({
            ticketId: recordId,
            cycle: 1,
            openedAt: now,
            openedBy: form.authorityMembershipId,
            overdueBreached: false,
          }),
        this.db
          .insert(ticketEvent)
          .values({
            id: crypto.randomUUID(),
            ticketId: recordId,
            cycle: 1,
            action: "created",
            actorId: form.authorityMembershipId,
            operationKey: `webform:${form.id}:${submissionKey}`,
            fingerprint,
            resultJson: JSON.stringify({
              id: recordId,
              status: "open",
              revision: 0,
            }),
            createdAt: now,
          }),
      );
    statements.push(
      this.db
        .insert(webformSubmission)
        .values({
          id: crypto.randomUUID(),
          formId: form.id,
          submissionKey,
          fingerprint,
          clientHash,
          recordId,
          missingFieldsJson: JSON.stringify(missing),
          createdAt: now,
        }),
      this.db
        .delete(operationConditionGuard)
        .where(eq(operationConditionGuard.id, guardId)),
    );
    try {
      await executeD1Batch(this.db, statements);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("operation_conflict")
      )
        throw new HttpError(
          429,
          "rate_limited",
          "Webform rate limit or authority check failed",
        );
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        const raced = await this.db
          .select({
            fingerprint: webformSubmission.fingerprint,
            recordId: webformSubmission.recordId,
            missingFieldsJson: webformSubmission.missingFieldsJson,
          })
          .from(webformSubmission)
          .where(
            and(
              eq(webformSubmission.formId, form.id),
              eq(webformSubmission.submissionKey, submissionKey),
            ),
          )
          .get();
        if (raced?.fingerprint === fingerprint)
          return {
            recordId: raced.recordId,
            replayed: true,
            missingFields: JSON.parse(raced.missingFieldsJson) as string[],
            entity: form.entity,
            source: form.source,
          };
        throw new HttpError(409, "conflict", "Submission key was already used");
      }
      throw error;
    }
    return {
      recordId,
      replayed: false,
      missingFields: missing,
      entity: form.entity,
      source: form.source,
    };
  }
  private validateMapping(input: WebformCreate) {
    const allowed =
      input.entity === "lead"
        ? new Set([
            "firstName",
            "lastName",
            "email",
            "phone",
            "title",
            "description",
          ])
        : new Set(["subject", "description", "priority", "category"]);
    if (Object.values(input.mapping).some((target) => !allowed.has(target)))
      throw new HttpError(
        400,
        "validation_failed",
        "Mapping contains a field for another record type",
      );
  }
  private async verifySystem(
    tokenHash: string,
    headers: Headers,
    rawBody: string,
    now: Date,
  ) {
    const authorization = headers.get("authorization") ?? "",
      token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "",
      timestamp = headers.get("x-webform-timestamp") ?? "",
      signature = headers.get("x-webform-signature") ?? "";
    if (!token || !safeEqual(await digest(token), tokenHash))
      throw new HttpError(401, "invalid_signature", "System token is invalid");
    const millis = Number(timestamp);
    if (!Number.isFinite(millis) || Math.abs(now.getTime() - millis) > 300_000)
      throw new HttpError(
        401,
        "invalid_signature",
        "System timestamp is outside the allowed window",
      );
    if (!safeEqual(await digest(`${token}.${timestamp}.${rawBody}`), signature))
      throw new HttpError(
        401,
        "invalid_signature",
        "System signature is invalid",
      );
  }
}
