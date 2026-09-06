import { recordAnchorKeys } from "@/lib/db/record-entities";
import { activityModules, modulesEnabledPredicate } from "../modules/module-policy";
import type { RequestContext } from "@/lib/http/request-context";
import { actionGuard, permissionError } from "../permissions/permission-policy";
import { and, desc, eq, getTableColumns, isNotNull, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { activity, company, contact, deal, lead, product, user } from "@/lib/db/schema";
import type { TimelineInput } from "@/lib/services/activities/activity-contract";

export class ActivityRepository {
  constructor(private readonly db: AppDatabase) {}

  async byId(id: string) {
    return this.db.select({ ...getTableColumns(activity), authorName: user.name, authorEmail: user.email })
      .from(activity).innerJoin(user, eq(user.id, activity.authorUserId)).where(eq(activity.id, id)).get();
  }

  async timeline(input: TimelineInput) {
    const anchor = activity[recordAnchorKeys[input.entity]];
    const conditions: SQL[] = [eq(anchor, input.recordId)];
    if (input.filter === "history") conditions.push(or(ne(activity.type, "task"), isNotNull(activity.completedAt))!);
    if (input.filter === "notes") conditions.push(eq(activity.type, "note"));
    if (input.filter === "calls") conditions.push(eq(activity.type, "call"));
    if (input.filter === "meetings") conditions.push(eq(activity.type, "meeting"));
    if (input.filter === "upcoming") conditions.push(eq(activity.type, "task"), isNull(activity.completedAt));
    if (input.filter === "done") conditions.push(eq(activity.type, "task"), isNotNull(activity.completedAt));
    if (input.cursor) {
      const [millis, id] = input.cursor.split(":");
      const date = new Date(Number(millis));
      conditions.push(or(lt(activity.createdAt, date), and(eq(activity.createdAt, date), lt(activity.id, id!)))!);
    }
    return this.db.select({ ...getTableColumns(activity), authorName: user.name, authorEmail: user.email })
      .from(activity).innerJoin(user, eq(user.id, activity.authorUserId)).where(and(...conditions))
      .orderBy(desc(activity.createdAt), desc(activity.id)).limit(input.limit + 1);
  }

  async create(values: typeof activity.$inferInsert, context: RequestContext) {
    const now = values.createdAt;
    const op = actionGuard(this.db, context, ["activity.create"], false, modulesEnabledPredicate(activityModules(values)));
    try { await this.db.batch([
      op.begin,
      this.db.insert(activity).values(values),
      this.db.update(company).set({ lastActivityAt: sql`max(coalesce(${company.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(company.id, values.companyId ?? "")),
      this.db.update(contact).set({ lastActivityAt: sql`max(coalesce(${contact.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(contact.id, values.contactId ?? "")),
      this.db.update(deal).set({ lastActivityAt: sql`max(coalesce(${deal.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(deal.id, values.dealId ?? "")),
      this.db.update(lead).set({ lastActivityAt: sql`max(coalesce(${lead.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(lead.id, values.leadId ?? "")),
      this.db.update(product).set({ lastActivityAt: sql`max(coalesce(${product.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(product.id, values.productId ?? "")),
      op.end,
    ]); } catch (error) { permissionError(error); }
    return (await this.byId(values.id))!;
  }

  async complete(id: string, completed: boolean, context: RequestContext) {
    const now = new Date();
    const stamp = (column: typeof activity.companyId | typeof activity.contactId | typeof activity.dealId | typeof activity.leadId | typeof activity.productId) => sql`(select ${column} from ${activity} where ${activity.id} = ${id} and ${activity.type} = 'task')`;
    const op = actionGuard(this.db, context, ["activity.update"], false, sql`exists (select 1 from activity a where a.id=${id}
      and (a.company_id is null or ${modulesEnabledPredicate(["company"])})
      and (a.contact_id is null or ${modulesEnabledPredicate(["contact"])})
      and (a.deal_id is null or ${modulesEnabledPredicate(["deal"])})
      and (a.lead_id is null or ${modulesEnabledPredicate(["lead"])})
      and (a.product_id is null or ${modulesEnabledPredicate(["product"])}))`);
    try {
    const [, rows] = await this.db.batch([
      op.begin,
      this.db.update(activity).set({ completedAt: completed ? now : null, updatedAt: now }).where(and(eq(activity.id, id), eq(activity.type, "task"))).returning({ id: activity.id }),
      this.db.update(company).set({ lastActivityAt: sql`max(coalesce(${company.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(company.id, stamp(activity.companyId))),
      this.db.update(contact).set({ lastActivityAt: sql`max(coalesce(${contact.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(contact.id, stamp(activity.contactId))),
      this.db.update(deal).set({ lastActivityAt: sql`max(coalesce(${deal.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(deal.id, stamp(activity.dealId))),
      this.db.update(lead).set({ lastActivityAt: sql`max(coalesce(${lead.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(lead.id, stamp(activity.leadId))),
      this.db.update(product).set({ lastActivityAt: sql`max(coalesce(${product.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(product.id, stamp(activity.productId))),
      op.end,
    ]);
    return rows.length ? this.byId(id) : undefined;
    } catch (error) { permissionError(error); }
  }
}
