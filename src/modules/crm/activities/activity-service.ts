import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { company, contact, deal } from "@/db/schema";
import { stageChangeMetadataSchema, type ActivityCreateInput, type TimelineInput } from "@/modules/crm/contracts/activity-contract";
import { toIso } from "@/modules/crm/contracts/list-contract";
import { relationError } from "@/modules/crm/service-utils";
import { HttpError } from "@/server/http-errors";
import type { RequestContext } from "@/server/request-context";
import { ActivityRepository } from "./activity-repository";

export class ActivityService {
  private readonly repository: ActivityRepository;
  constructor(private readonly db: AppDatabase) { this.repository = new ActivityRepository(db); }
  private guard(context: RequestContext) {
    if (!context.userId || !context.membershipId) throw new HttpError(403, "membership_required", "Active membership is required");
  }
  async create(context: RequestContext, input: ActivityCreateInput) {
    this.guard(context);
    const contactRow = input.contactId ? await this.db.select().from(contact).where(eq(contact.id, input.contactId)).get() : undefined;
    const dealRow = input.dealId ? await this.db.select().from(deal).where(eq(deal.id, input.dealId)).get() : undefined;
    if ((input.contactId && !contactRow) || (input.dealId && !dealRow)) throw new HttpError(404, "not_found", "Activity record was not found");
    const companyId = input.companyId ?? dealRow?.companyId ?? contactRow?.companyId ?? null;
    if (companyId && !(await this.db.select({ id: company.id }).from(company).where(eq(company.id, companyId)).get())) throw new HttpError(404, "not_found", "Activity company was not found");
    if ((contactRow && companyId && contactRow.companyId !== companyId) || (dealRow && dealRow.companyId !== companyId)) throw new HttpError(409, "conflict", "Activity records must belong to the same company");
    const now = new Date();
    try {
      const row = await this.repository.create({
        id: crypto.randomUUID(), type: input.type, subject: input.subject || null, content: input.content || null,
        companyId, contactId: input.contactId ?? null, dealId: input.dealId ?? null, authorUserId: context.userId,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : now, dueAt: input.dueAt ? new Date(input.dueAt) : null,
        completedAt: null, metadataJson: null, createdAt: now, updatedAt: now,
      });
      return this.serialize(row);
    } catch (error) { relationError(error, "Activity relationships changed"); }
  }
  async timeline(context: RequestContext, input: TimelineInput) {
    this.guard(context);
    const table = input.entity === "company" ? company : input.entity === "contact" ? contact : deal;
    if (!(await this.db.select({ id: table.id }).from(table).where(eq(table.id, input.recordId)).get())) throw new HttpError(404, "not_found", "Activity record was not found");
    const rows = await this.repository.timeline(input);
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return { entries: page.map(row => this.serialize(row)), nextCursor: rows.length > input.limit && last ? `${last.createdAt.getTime()}:${last.id}` : null };
  }
  async complete(context: RequestContext, id: string, completed: boolean) {
    this.guard(context);
    const current = await this.repository.byId(id);
    if (!current) throw new HttpError(404, "not_found", "Activity was not found");
    if (current.type !== "task") throw new HttpError(400, "validation_failed", "Only tasks can be completed");
    const row = await this.repository.complete(id, completed);
    if (!row) throw new HttpError(409, "conflict", "Task changed before completion");
    return this.serialize(row);
  }
  private serialize(row: NonNullable<Awaited<ReturnType<ActivityRepository["byId"]>>>) {
    return {
      id: row.id, type: row.type, subject: row.subject, content: row.content,
      companyId: row.companyId, contactId: row.contactId, dealId: row.dealId,
      author: { id: row.authorUserId, name: row.authorName, email: row.authorEmail },
      metadata: row.type === "stage_change" ? stageChangeMetadataSchema.parse(JSON.parse(row.metadataJson ?? "null")) : null,
      occurredAt: toIso(row.occurredAt), dueAt: toIso(row.dueAt), completedAt: toIso(row.completedAt),
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    };
  }
}
