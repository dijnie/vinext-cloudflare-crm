import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { contact, crmSetting, lead, leadConversion, operationConditionGuard } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-errors";
import type { RequestContext } from "@/lib/http/request-context";
import { contactCreateInputSchema, type ContactCreateInput } from "../contacts/contact-contract";
import { ContactService } from "../contacts/contact-service";
import { FieldService } from "../custom-fields/field-service";
import type { FieldValue } from "../custom-fields/field-contracts";
import { normalizeLeadPhone } from "../leads/lead-normalization";
import { modulesEnabledPredicate, requireModulesEnabled } from "../modules/module-policy";
import { actionGuard, permissionError, permissionPredicate, requirePermission } from "../permissions/permission-policy";
import { DraftService } from "../record-drafts/draft-service";
import { OrderService } from "../orders/order-service";
import type { OrderCreateInput } from "../orders/order-contract";
import { normalizeEmail, relationError } from "../shared/service-utils";
import { leadConversionPreviewInputSchema, leadConversionRequestSchema, leadConversionResultSchema, type LeadConversionPreviewInput, type LeadConversionRequest, type LeadConversionResult } from "./lead-conversion-contracts";
import { LeadMappingService, mappingField, validateMappings } from "./lead-mapping-service";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
async function fingerprint(leadId: string, input: LeadConversionRequest) {
  const { operationKey: _operationKey, ...payload } = input;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical({ leadId, ...payload })));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
function conflict(message: string): never { throw new HttpError(409, "conflict", message); }
const leadValuesRevision = sql<number>`(SELECT COALESCE(SUM(v.revision),0) FROM field_value_revision v JOIN custom_field_definition f ON f.id=v.field_id WHERE f.entity='lead')`;
function operationError(error: unknown): never {
  let current: unknown = error;
  while (current && typeof current === "object") {
    if (current instanceof Error && /operation_conflict|lead_.*(?:converted|conversion|revision)/.test(current.message)) conflict("Conversion state changed; preview again");
    current = "cause" in current ? current.cause : null;
  }
  relationError(error, "Contact email or conversion operation conflicts with an existing record");
}

export class LeadConversionService {
  constructor(private readonly db: AppDatabase) {}
  async history(context: RequestContext, leadId: string): Promise<LeadConversionResult[]> {
    await requirePermission(this.db, context);
    const rows = await this.db.select().from(leadConversion).where(and(eq(leadConversion.leadId, leadId), permissionPredicate(context)));
    return rows.map(row => leadConversionResultSchema.parse(JSON.parse(row.resultJson)));
  }
  private async replay(context: RequestContext, leadId: string, input: LeadConversionRequest, digest: string) {
    await requirePermission(this.db, context);
    const rows = await this.db.select().from(leadConversion).where(and(or(eq(leadConversion.operationKey, input.operationKey), eq(leadConversion.leadId, leadId)), permissionPredicate(context)));
    const operation = rows.find(row => row.operationKey === input.operationKey);
    if (operation) {
      if (operation.leadId !== leadId || operation.fingerprint !== digest) conflict("Operation key was already used for a different request");
      return leadConversionResultSchema.parse(JSON.parse(operation.resultJson));
    }
    const previous = rows.find(row => row.leadId === leadId);
    if (!previous) return null;
    const historical = leadConversionResultSchema.parse(JSON.parse(previous.resultJson));
    if (previous.fingerprint === digest || !input.order && historical.orderId === null && input.target.mode === "link" && input.target.contactId === previous.contactId) return historical;
    conflict("Lead already converted to a different destination or request");
  }
  async preview(context: RequestContext, leadId: string, raw: LeadConversionPreviewInput = {}) {
    await requirePermission(this.db, context);
    const input = leadConversionPreviewInputSchema.parse(raw);
    const record = await this.db.select().from(lead).where(and(eq(lead.id, leadId), permissionPredicate(context))).get();
    if (!record) throw new HttpError(404, "not_found", "Lead was not found");
    const mapping = await new LeadMappingService(this.db).get(context);
    const valueRevision = await this.db.get<{ revision: number }>(sql`SELECT ${leadValuesRevision} AS revision`);
    const calendar = await this.db.select({ revision: crmSetting.calendarRevision }).from(crmSetting).where(eq(crmSetting.id, "settings")).get();
    if (!calendar) throw new Error("Business settings unavailable");
    const values = await new FieldService(this.db).values(context, { entity: "lead", recordId: leadId });
    const proposed: Record<string, unknown> = {}, custom: Record<string, FieldValue> = {}, errors: { field: string; message: string }[] = [];
    for (const pair of mapping.mappings) {
      try {
        validateMappings([pair], mapping.leadFields, mapping.contactFields);
        const source = mappingField(pair.source, mapping.leadFields, true), target = mappingField(pair.target, mapping.contactFields);
        let value: unknown = source.field ? values[source.key] : record[source.key as keyof typeof record];
        if (value === null || value === undefined || value === "") continue;
        if (pair.options) {
          const selected = Array.isArray(value) ? value : [value];
          if (selected.some(id => typeof id !== "string" || !pair.options![id])) throw new HttpError(400, "validation_failed", "Source selection has no available target mapping");
          value = Array.isArray(value) ? selected.map(id => pair.options![String(id)]!) : pair.options[String(value)];
        }
        if (target.field) custom[target.key] = value as FieldValue; else proposed[target.key] = value;
      } catch (error) { errors.push({ field: pair.target, message: error instanceof Error ? error.message : "Mapping is invalid" }); }
    }
    Object.assign(proposed, { customFields: custom }, input.contact);
    if (mapping.contactFields.some(field => field.type === "date" && field.config?.dateTime && Object.hasOwn((proposed.customFields ?? {}) as object, field.key))) proposed.calendarRevision = calendar.revision;
    const parsed = contactCreateInputSchema.safeParse(proposed);
    if (!parsed.success) errors.push(...parsed.error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message })));
    else {
      // Prepare only: no contact, reservation or operation is committed by preview.
      try { await new ContactService(this.db).prepareCreate(context, parsed.data); }
      catch (error) { errors.push({ field: "contact", message: error instanceof Error ? error.message : "Contact is invalid" }); }
    }
    let orderPreview = null;
    if (mapping.autoOrder && !input.order) errors.push({ field: "order", message: "A draft order is required by the current conversion settings" });
    else if (!mapping.autoOrder && input.order) errors.push({ field: "order", message: "Automatic order creation is disabled" });
    else if (input.order) {
      const { draftId, ...order } = input.order;
      const contactId = crypto.randomUUID();
      try {
        const creation = draftId ? await new DraftService(this.db).prepareConsumption(context, "order", draftId) : undefined;
        const preparedOrder = await new OrderService(this.db).prepareCreate(context, { ...order, contactId, leadId } as OrderCreateInput, creation, { preparedContactId: contactId });
        orderPreview = await new OrderService(this.db).preview(context, { ...order, contactId, leadId } as OrderCreateInput);
        void preparedOrder;
      } catch (error) { errors.push({ field: "order", message: error instanceof Error ? error.message : "Order is invalid" }); }
    }
    const email = normalizeEmail(record.email), phone = normalizeLeadPhone(record.phone);
    const candidates = email || phone ? await this.db.select({ id: contact.id, firstName: contact.firstName, lastName: contact.lastName, email: contact.email, phone: contact.phone, normalizedPhone: contact.normalizedPhone }).from(contact).where(and(isNull(contact.archivedAt), or(email ? eq(contact.email, email) : undefined, phone ? eq(contact.normalizedPhone, phone) : undefined), permissionPredicate(context))).limit(20) : [];
    await requirePermission(this.db, context);
    const consistent = await this.db.get<{ valid: number }>(sql`SELECT (
      EXISTS (SELECT 1 FROM lead WHERE id=${leadId} AND revision=${record.revision})
      AND EXISTS (SELECT 1 FROM lead_mapping WHERE id='contact' AND revision=${mapping.revision})
      AND EXISTS (SELECT 1 FROM field_configuration_revision WHERE entity='lead' AND revision=${mapping.leadFieldRevision})
      AND EXISTS (SELECT 1 FROM field_configuration_revision WHERE entity='contact' AND revision=${mapping.contactFieldRevision})
      AND EXISTS (SELECT 1 FROM crm_setting WHERE id='settings' AND calendar_revision=${calendar.revision})
      AND ${leadValuesRevision}=${valueRevision!.revision}) AS valid`);
    if (!consistent?.valid) conflict("Lead or conversion settings changed while preparing the preview");
    return { leadRevision: record.revision, mappingRevision: mapping.revision, leadValueRevision: valueRevision!.revision, leadFieldRevision: mapping.leadFieldRevision, contactFieldRevision: mapping.contactFieldRevision, calendarRevision: calendar.revision, autoOrder: mapping.autoOrder, orderPreview,
      proposedContact: proposed as Partial<ContactCreateInput>, candidates: candidates.map(({ normalizedPhone, ...candidate }) => ({ ...candidate, reasons: [email && candidate.email === email ? "email" as const : null, phone && normalizedPhone === phone ? "phone" as const : null].filter((reason): reason is "email" | "phone" => reason !== null) })), errors, conversion: (await this.history(context, leadId))[0] ?? null };
  }
  async apply(context: RequestContext, leadId: string, raw: LeadConversionRequest): Promise<LeadConversionResult> {
    const parsed = leadConversionRequestSchema.safeParse(raw);
    if (!parsed.success) throw new HttpError(400, "validation_failed", "Conversion request is invalid");
    const input = parsed.data, digest = await fingerprint(leadId, input);
    const previous = await this.replay(context, leadId, input, digest);
    if (previous) return previous;
    try { return await this.fresh(context, leadId, input, digest); }
    catch (error) {
      const replayed = await this.replay(context, leadId, input, digest);
      if (replayed) return replayed;
      throw error;
    }
  }
  private async fresh(context: RequestContext, leadId: string, input: LeadConversionRequest, digest: string): Promise<LeadConversionResult> {
    await requirePermission(this.db, context, ["lead.convert"]);
    await requireModulesEnabled(this.db, ["lead", "contact", ...(input.order ? ["order" as const] : [])]);
    const record = await this.db.select().from(lead).where(eq(lead.id, leadId)).get();
    if (!record) throw new HttpError(404, "not_found", "Lead was not found");
    if (record.archivedAt || record.convertedAt || record.revision !== input.expectedLeadRevision) conflict("Lead changed or is already converted");
    const mapping = await new LeadMappingService(this.db).get(context);
    const valueRevision = await this.db.get<{ revision: number }>(sql`SELECT ${leadValuesRevision} AS revision`);
    if (valueRevision!.revision !== input.expectedLeadValueRevision) conflict("Lead field values changed; preview again");
    if (mapping.revision !== input.expectedMappingRevision || input.expectedLeadFieldRevision !== undefined && input.expectedLeadFieldRevision !== mapping.leadFieldRevision || input.expectedContactFieldRevision !== undefined && input.expectedContactFieldRevision !== mapping.contactFieldRevision) conflict("Conversion configuration changed; preview again");
    if (mapping.autoOrder !== Boolean(input.order)) throw new HttpError(400, "validation_failed", mapping.autoOrder ? "A draft order is required" : "Automatic order creation is disabled");
    let prepared: Awaited<ReturnType<ContactService["prepareCreate"]>> | undefined;
    let contactId: string;
    if (input.target.mode === "create") {
      validateMappings(mapping.mappings, mapping.leadFields, mapping.contactFields);
      const contactInput = input.target.contact;
      if (contactInput.calendarRevision === undefined && mapping.contactFields.some(field => field.type === "date" && field.config?.dateTime && Object.hasOwn(contactInput.customFields ?? {}, field.key))) throw new HttpError(400, "validation_failed", "Datetime conversion requires the preview calendar revision");
      const creation = input.target.draftId ? await new DraftService(this.db).prepareConsumption(context, "contact", input.target.draftId) : undefined;
      prepared = await new ContactService(this.db).prepareCreate(context, input.target.contact, creation);
      contactId = prepared.result.id;
    } else {
      contactId = input.target.contactId;
      if (!await this.db.select({ id: contact.id }).from(contact).where(and(eq(contact.id, contactId), isNull(contact.archivedAt))).get()) throw new HttpError(400, "validation_failed", "Choose an active contact");
    }
    let preparedOrder: Awaited<ReturnType<OrderService["prepareCreate"]>> | undefined;
    if (input.order) {
      const { draftId, ...order } = input.order;
      const creation = draftId ? await new DraftService(this.db).prepareConsumption(context, "order", draftId) : undefined;
      preparedOrder = await new OrderService(this.db).prepareCreate(context, { ...order, contactId, leadId } as OrderCreateInput, creation, input.target.mode === "create" ? { preparedContactId: contactId } : undefined);
    }
    const now = new Date(), result: LeadConversionResult = { operationKey: input.operationKey, leadId, contactId, orderId: preparedOrder?.result.id ?? null, mode: input.target.mode, convertedAt: now.toISOString() };
    const conversionModules: ("lead" | "contact" | "order")[] = ["lead", "contact", ...(input.order ? ["order" as const] : [])];
    const authorization = actionGuard(this.db, context, ["lead.convert"], false, modulesEnabledPredicate(conversionModules));
    const guardId = crypto.randomUUID();
    const predicate = sql`EXISTS (SELECT 1 FROM lead WHERE id=${leadId} AND archived_at IS NULL AND converted_at IS NULL AND revision=${input.expectedLeadRevision})
      AND EXISTS (SELECT 1 FROM lead_mapping WHERE id='contact' AND revision=${mapping.revision})
      AND EXISTS (SELECT 1 FROM field_configuration_revision WHERE entity='lead' AND revision=${mapping.leadFieldRevision})
      AND EXISTS (SELECT 1 FROM field_configuration_revision WHERE entity='contact' AND revision=${mapping.contactFieldRevision})
      AND ${leadValuesRevision}=${input.expectedLeadValueRevision}
      AND ${input.target.mode === "link" ? sql`EXISTS (SELECT 1 FROM contact WHERE id=${contactId} AND archived_at IS NULL)` : sql`1=1`}`;
    try {
      await this.db.batch([authorization.begin,
        this.db.insert(operationConditionGuard).values({ id: guardId, authorized: sql<number>`CASE WHEN ${predicate} THEN 1 ELSE 0 END` }),
        ...(prepared?.statements ?? []), ...(preparedOrder?.statements ?? []),
        this.db.update(lead).set({ statusId: "converted", convertedContactId: contactId, convertedAt: now, revision: sql`${lead.revision}+1`, updatedAt: now }).where(eq(lead.id, leadId)),
        this.db.insert(leadConversion).values({ id: crypto.randomUUID(), leadId, operationKey: input.operationKey, fingerprint: digest, actorId: context.userId, contactId, mode: input.target.mode, leadRevision: input.expectedLeadRevision, mappingRevision: mapping.revision, snapshotJson: JSON.stringify({ mappings: mapping.mappings, leadFieldRevision: mapping.leadFieldRevision, contactFieldRevision: mapping.contactFieldRevision, leadValueRevision: input.expectedLeadValueRevision, target: input.target }), resultJson: JSON.stringify(result), completedAt: now }),
        this.db.delete(operationConditionGuard).where(eq(operationConditionGuard.id, guardId)), authorization.end]);
    } catch (error) {
      const replayed = await this.replay(context, leadId, input, digest);
      if (replayed) return replayed;
      try { permissionError(error); } catch (classified) {
        try { if (prepared) prepared.translateError(classified); if (preparedOrder) preparedOrder.translateError(classified); throw classified; } catch (translated) { operationError(translated); }
      }
    }
    return result;
  }
}
