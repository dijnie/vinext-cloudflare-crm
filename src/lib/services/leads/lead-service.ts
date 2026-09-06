import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { lead, contact, leadSource, leadStatus } from "@/lib/db/schema";
import type { RequestContext } from "@/lib/http/request-context";
import { HttpError } from "@/lib/http/http-errors";
import { toIso } from "@/lib/listing/list-contract";
import { FieldService } from "../custom-fields/field-service";
import type { PreparedRecordCreation } from "../shared/record-fields-contract";
import { blankToNull, normalizeEmail, relationError } from "../shared/service-utils";
import { permissionPredicate, requirePermission } from "../permissions/permission-policy";
import { LeadRepository } from "./lead-repository";
import type { LeadCreateInput, LeadListInput, LeadUpdateData } from "./lead-contract";
import { normalizeLeadPhone } from "./lead-normalization";

export function leadWriteError(error: unknown): never {
  let current = error;
  while (current && typeof current === "object") {
    if (current instanceof Error && /lead_(source_unavailable|status_unavailable|reason_required|owner_inactive|collaborator_inactive|conversion_immutable)|operation_conflict/.test(current.message)) throw new HttpError(409, "conflict", "Lead or its configuration changed; reload before saving");
    current = "cause" in current ? current.cause : null;
  }
  relationError(error, "Lead relationships are invalid");
}
export class LeadService {
  private readonly repository: LeadRepository;
  constructor(private readonly db: AppDatabase) { this.repository = new LeadRepository(db); }
  async list(context: RequestContext, input: LeadListInput) {
    await requirePermission(this.db, context);
    const result = await this.repository.list(input);
    return { ...result, rows: result.rows.map(row => this.serialize(row)) };
  }
  async byId(context: RequestContext, id: string) {
    await requirePermission(this.db, context);
    const row = await this.repository.byId(id);
    if (!row) throw new HttpError(404, "not_found", "Lead was not found");
    return this.serialize(row);
  }
  async create(context: RequestContext, input: LeadCreateInput, creation?: PreparedRecordCreation) {
    await requirePermission(this.db, context, ["lead.create", ...(input.ownerMembershipId || input.collaboratorMembershipIds?.length ? ["lead.assign" as const] : [])]);
    await this.validate(input);
    const id = creation?.recordId ?? crypto.randomUUID();
    const fields = await new FieldService(this.db).prepareValues(context, { entity: "lead", recordId: id, values: input.customFields ?? {}, calendarRevision: input.calendarRevision }, "create");
    const now = new Date();
    try {
      const row = await this.repository.create({ id, firstName: input.firstName, lastName: blankToNull(input.lastName) ?? null, email: normalizeEmail(input.email) ?? null, normalizedEmail: normalizeEmail(input.email) ?? null, phone: blankToNull(input.phone) ?? null, normalizedPhone: normalizeLeadPhone(input.phone), title: blankToNull(input.title) ?? null, description: blankToNull(input.description) ?? null, companyId: input.companyId ?? null, ownerMembershipId: input.ownerMembershipId ?? null, sourceId: input.sourceId ?? "manual", statusId: input.statusId ?? "new", rejectionReason: blankToNull(input.rejectionReason) ?? null, creatorUserId: context.userId, createdAt: now, updatedAt: now }, context, fields, creation, [...new Set(input.collaboratorMembershipIds ?? [])]);
      return { id: row.id, firstName: row.firstName, lastName: row.lastName };
    } catch (error) { leadWriteError(error); }
  }
  async update(context: RequestContext, id: string, input: LeadUpdateData) {
    await requirePermission(this.db, context, ["lead.update", ...(input.ownerMembershipId !== undefined || input.collaboratorMembershipIds !== undefined ? ["lead.assign" as const] : [])]);
    const existing = await this.repository.byId(id);
    if (!existing) throw new HttpError(404, "not_found", "Lead was not found");
    if (existing.revision !== input.expectedRevision) throw new HttpError(409, "conflict", "Lead changed; reload before saving");
    await this.validate(input, existing);
    const values: Partial<typeof lead.$inferInsert> = { updatedAt: new Date() };
    for (const key of ["firstName", "companyId", "ownerMembershipId", "sourceId", "statusId"] as const) if (input[key] !== undefined) Object.assign(values, { [key]: input[key] });
    for (const key of ["lastName", "phone", "title", "description", "rejectionReason"] as const) if (input[key] !== undefined) Object.assign(values, { [key]: blankToNull(input[key]) });
    if (input.email !== undefined) values.email = values.normalizedEmail = normalizeEmail(input.email);
    if (input.phone !== undefined) values.normalizedPhone = normalizeLeadPhone(input.phone);
    const fields = await new FieldService(this.db).prepareValues(context, { entity: "lead", recordId: id, values: input.customFields ?? {}, calendarRevision: input.calendarRevision });
    try { const row = await this.repository.update(id, values, input.expectedRevision, context, fields, input.collaboratorMembershipIds === undefined ? undefined : [...new Set(input.collaboratorMembershipIds)]); return { id: row.id, firstName: row.firstName, lastName: row.lastName }; } catch (error) { leadWriteError(error); }
  }
  async archive(context: RequestContext, id: string, restore = false) {
    await requirePermission(this.db, context, [restore ? "lead.restore" : "lead.archive"]);
    try { const row = await this.repository.archive(id, restore ? null : new Date(), context); if (!row) throw new HttpError(404, "not_found", "Lead was not found"); return { id: row.id, name: [row.firstName, row.lastName].filter(Boolean).join(" "), archivedAt: toIso(row.archivedAt) }; } catch (error) { leadWriteError(error); }
  }
  async bulkArchive(context: RequestContext, ids: string[], restore = false) {
    await requirePermission(this.db, context, [restore ? "lead.restore" : "lead.archive"]);
    try { const succeeded = await this.repository.bulkArchive(ids, restore ? null : new Date(), context); return { requested: ids.length, succeeded, failed: ids.length - succeeded }; } catch (error) { leadWriteError(error); }
  }
  async duplicates(context: RequestContext, input: { email?: string | null; phone?: string | null; excludeLeadId?: string ;}) {
    await requirePermission(this.db, context);
    const email = normalizeEmail(input.email) ?? null, phone = normalizeLeadPhone(input.phone);
    if (!email && !phone) return { leads: [], contacts: [] };
    const leads = await this.db.select().from(lead).where(and(permissionPredicate(context), isNull(lead.archivedAt), input.excludeLeadId ? sql`${lead.id} != ${input.excludeLeadId}` : undefined, or(email ? eq(lead.normalizedEmail, email) : undefined, phone ? eq(lead.normalizedPhone, phone) : undefined))).orderBy(lead.id).limit(20);
    const contacts = await this.db.select().from(contact).where(and(permissionPredicate(context), isNull(contact.archivedAt), or(email ? eq(contact.email, email) : undefined, phone ? eq(contact.normalizedPhone, phone) : undefined))).orderBy(contact.id).limit(20);
    const serialize = (row: { id: string; firstName: string; lastName: string | null; email: string | null; phone: string | null; normalizedPhone: string | null }) => ({ id: row.id, firstName: row.firstName, lastName: row.lastName, email: row.email, phone: row.phone, reasons: [...(email && row.email === email ? ["email" as const] : []), ...(phone && row.normalizedPhone === phone ? ["phone" as const] : [])] });
    return { leads: leads.map(serialize), contacts: contacts.map(serialize) };
  }
  private async validate(input: Partial<LeadCreateInput> | LeadUpdateData, existing?: typeof lead.$inferSelect) {
    if (input.companyId && !await this.repository.company(input.companyId)) throw new HttpError(404, "not_found", "Company was not found");
    const members = [input.ownerMembershipId, ...input.collaboratorMembershipIds ?? []].filter((id): id is string => Boolean(id));
    for (const id of new Set(members)) if (!await this.repository.activeMember(id)) throw new HttpError(400, "validation_failed", "Assignee and collaborators must be active members");
    const sourceId = input.sourceId ?? existing?.sourceId ?? "manual", statusId = input.statusId ?? existing?.statusId ?? "new";
    const source = await this.db.select().from(leadSource).where(eq(leadSource.id, sourceId)).get();
    const status = await this.db.select().from(leadStatus).where(eq(leadStatus.id, statusId)).get();
    if (!source || source.archivedAt && sourceId !== existing?.sourceId) throw new HttpError(409, "conflict", "Lead source is unavailable");
    if (!status || status.archivedAt && statusId !== existing?.statusId || status.meaning === "converted" && statusId !== existing?.statusId || existing?.convertedAt && statusId !== existing.statusId) throw new HttpError(409, "conflict", "Lead status is unavailable");
    if ((!existing || statusId !== existing.statusId || input.rejectionReason !== undefined) && status.meaning === "rejected" && status.requiresReason && !blankToNull(input.rejectionReason === undefined ? existing?.rejectionReason : input.rejectionReason)) throw new HttpError(400, "validation_failed", "A rejection reason is required");
  }
  private serialize<T extends { normalizedEmail: string | null; normalizedPhone: string | null; ownerMembershipId: string | null; ownerName: string | null; ownerEmail: string | null; companyId: string | null; companyName: string | null; companyDomain: string | null; lastActivityAt: Date | null; archivedAt: Date | null; convertedAt: Date | null; createdAt: Date; updatedAt: Date; collaboratorMembershipIds: string; collaboratorLabels: string ;}>(row: T) {
    const { normalizedEmail: _email, normalizedPhone: _phone, ownerName, ownerEmail, companyName, companyDomain, collaboratorLabels, collaboratorMembershipIds, lastActivityAt, archivedAt, convertedAt, createdAt, updatedAt, ...record } = row;
    return { ...record, owner: row.ownerMembershipId ? { membershipId: row.ownerMembershipId, name: row.ownerName, email: row.ownerEmail } : null, company: row.companyId ? { id: row.companyId, name: row.companyName, domain: row.companyDomain } : null, collaboratorLabels: JSON.parse(collaboratorLabels) as Record<string, string>, collaboratorMembershipIds: JSON.parse(row.collaboratorMembershipIds) as string[], lastActivityAt: toIso(row.lastActivityAt), archivedAt: toIso(row.archivedAt), convertedAt: toIso(row.convertedAt), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }
}
