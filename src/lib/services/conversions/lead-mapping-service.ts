import { and, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { leadMapping } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-errors";
import type { RequestContext } from "@/lib/http/request-context";
import type { FieldDefinition, FieldType } from "../custom-fields/field-contracts";
import { FieldRepository } from "../custom-fields/field-repository";
import { FieldService } from "../custom-fields/field-service";
import { actionGuard, permissionError, permissionPredicate, requirePermission } from "../permissions/permission-policy";
import { leadMappingPairSchema, leadMappingUpdateSchema, type LeadMappingPair, type LeadMappingUpdate } from "./lead-conversion-contracts";

const builtins: Record<string, FieldType | "company"> = { firstName: "text", lastName: "text", email: "email", phone: "phone", title: "text", companyId: "company", ownerMembershipId: "user" };
export function mappingField(identity: string, fields: FieldDefinition[], source = false) {
  if (identity.startsWith("builtin:")) {
    const key = identity.slice(8), type = builtins[key] ?? (source && key === "description" ? "long_text" : undefined);
    if (!type) throw new HttpError(400, "validation_failed", "Unknown builtin mapping field");
    return { key, type, field: undefined };
  }
  const field = fields.find(item => item.id === identity.slice(7) && !item.archivedAt);
  if (!field) throw new HttpError(400, "validation_failed", "Unknown or archived mapping field");
  return { key: field.key, type: field.type, field };
}
export function validateMappings(mappings: LeadMappingPair[], sourceFields: FieldDefinition[], targetFields: FieldDefinition[]) {
  if (new Set(mappings.map(pair => pair.target)).size !== mappings.length) throw new HttpError(400, "validation_failed", "Each target may be mapped only once");
  const text = ["text", "long_text", "email", "phone", "url"];
  for (const pair of mappings) {
    const source = mappingField(pair.source, sourceFields, true), target = mappingField(pair.target, targetFields);
    if (source.type === "file" || target.type === "file") throw new HttpError(400, "validation_failed", "Files stay with their source record; upload contact files to a new contact draft");
    if (target.type === "formula") throw new HttpError(400, "validation_failed", "Formula targets are read-only");
    if (!(source.type === target.type || text.includes(source.type) && text.includes(target.type) || ["formula", "number", "rating"].includes(source.type) && ["number", "rating"].includes(target.type))) throw new HttpError(400, "validation_failed", "Mapping types are incompatible");
    if (["select", "multiselect"].includes(source.type)) {
      if (!pair.options) throw new HttpError(400, "validation_failed", "Selection mappings require explicit option IDs");
      const activeSource = source.field!.options.filter(option => !option.archivedAt), activeTarget = target.field!.options.filter(option => !option.archivedAt);
      if (Object.entries(pair.options).some(([from, to]) => !activeSource.some(option => option.id === from) || !activeTarget.some(option => option.id === to)) || activeSource.some(option => !pair.options![option.id])) throw new HttpError(400, "validation_failed", "Every active source option needs a valid target option");
    } else if (pair.options && Object.keys(pair.options).length) throw new HttpError(400, "validation_failed", "Option mappings apply only to selection fields");
  }
}

export class LeadMappingService {
  constructor(private readonly db: AppDatabase) {}
  async get(context: RequestContext) {
    await requirePermission(this.db, context);
    const repository = new FieldRepository(this.db), service = new FieldService(this.db);
    const [leadConfiguration, contactConfiguration] = await Promise.all([repository.configuration("lead"), repository.configuration("contact")]);
    const [leadFields, contactFields] = await Promise.all([service.list(context, { entity: "lead" }), service.list(context, { entity: "contact" })]);
    const row = await this.db.select({ revision: leadMapping.revision, mappingsJson: leadMapping.mappingsJson, autoOrder: leadMapping.autoOrder, autoDeal: leadMapping.autoDeal, canManage: sql<number>`${permissionPredicate(context, [], true)}` }).from(leadMapping).where(and(eq(leadMapping.id, "contact"), permissionPredicate(context))).get();
    if (!row) throw new HttpError(403, "membership_required", "Conversion settings unavailable");
    return { revision: row.revision, mappings: leadMappingPairSchema.array().parse(JSON.parse(row.mappingsJson)), autoOrder: false as const, autoDeal: false as const, canManage: Boolean(row.canManage), leadFieldRevision: leadConfiguration.revision, contactFieldRevision: contactConfiguration.revision, leadFields, contactFields };
  }
  async update(context: RequestContext, raw: LeadMappingUpdate) {
    await requirePermission(this.db, context, [], true);
    const parsed = leadMappingUpdateSchema.safeParse(raw);
    if (!parsed.success) throw new HttpError(400, "validation_failed", "Invalid mapping; automatic order/deal creation is unavailable");
    const input = parsed.data, current = await this.get(context);
    if (input.revision !== current.revision) throw new HttpError(409, "conflict", "Mapping settings changed");
    validateMappings(input.mappings, current.leadFields, current.contactFields);
    const guard = actionGuard(this.db, context, [], true);
    try {
      const [, changed] = await this.db.batch([guard.begin, this.db.update(leadMapping).set({ mappingsJson: JSON.stringify(input.mappings), revision: sql`${leadMapping.revision}+1`, updatedAt: new Date() }).where(and(eq(leadMapping.id, "contact"), eq(leadMapping.revision, input.revision), sql`EXISTS (SELECT 1 FROM field_configuration_revision WHERE entity='lead' AND revision=${current.leadFieldRevision}) AND EXISTS (SELECT 1 FROM field_configuration_revision WHERE entity='contact' AND revision=${current.contactFieldRevision})`)).returning({ id: leadMapping.id }), guard.end]);
      if (!changed.length) throw new HttpError(409, "conflict", "Mapping or fields changed");
    } catch (error) { permissionError(error); }
    return this.get(context);
  }
}
