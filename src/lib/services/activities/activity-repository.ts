import { recordAnchorKeys } from "@/lib/db/record-entities";
import { activityModules, modulesEnabledPredicate } from "../modules/module-policy";
import type { RequestContext } from "@/lib/http/request-context";
import { actionGuard, permissionError } from "../permissions/permission-policy";
import { and, desc, eq, getTableColumns, isNotNull, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { activity, company, contact, deal, lead, product, salesOrder, taskCycle, taskOperation, taskRecord, user } from "@/lib/db/schema";
import type { TimelineInput } from "@/lib/services/activities/activity-contract";
import { HttpError } from "@/lib/http/http-errors";
import { condition } from "../orders/order-operations";

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

  async create(values: typeof activity.$inferInsert, context: RequestContext, taskAssignee?: string) {
    const now = values.createdAt;
    const op = actionGuard(this.db, context, [values.type === "task" ? "task.create" : "activity.create"], false, modulesEnabledPredicate(activityModules(values)));
    try { await this.db.batch([
      op.begin,
      this.db.insert(activity).values(values),
      ...values.type === "task" ? [
        this.db.insert(taskRecord).values({ activityId: values.id!, assigneeMembershipId: taskAssignee ?? context.userId, currentCycle: 1, dueAt: values.dueAt ?? null, completedAt: null, overdueBreached: false, revision: 0, createdAt: now, updatedAt: now }),
        this.db.insert(taskCycle).values({ taskId: values.id!, cycle: 1, openedAt: now, openedBy: context.userId, dueAt: values.dueAt ?? null, completedAt: null, overdueBreached: false, reopenReason: null }),
      ] : [],
      this.db.update(company).set({ lastActivityAt: sql`max(coalesce(${company.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(company.id, values.companyId ?? "")),
      this.db.update(contact).set({ lastActivityAt: sql`max(coalesce(${contact.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(contact.id, values.contactId ?? "")),
      this.db.update(deal).set({ lastActivityAt: sql`max(coalesce(${deal.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(deal.id, values.dealId ?? "")),
      this.db.update(lead).set({ lastActivityAt: sql`max(coalesce(${lead.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(lead.id, values.leadId ?? "")),
      this.db.update(product).set({ lastActivityAt: sql`max(coalesce(${product.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(product.id, values.productId ?? "")),
      this.db.update(salesOrder).set({ lastActivityAt: sql`max(coalesce(${salesOrder.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(salesOrder.id, values.orderId ?? "")),
      op.end,
    ]); } catch (error) { permissionError(error); }
    return (await this.byId(values.id))!;
  }

  async complete(id: string, completed: boolean, context: RequestContext, input: { reason?: string; operationKey: string; expectedRevision?: number }) {
    const now = new Date();
    const currentTask = await this.db.select().from(taskRecord).where(eq(taskRecord.activityId,id)).get();
    if(!currentTask) throw new HttpError(404,"not_found","Task was not found");
    const fingerprint=JSON.stringify({completed,reason:input.reason??null,expectedRevision:input.expectedRevision??currentTask.revision});
    const previous=await this.db.select().from(taskOperation).where(eq(taskOperation.id,input.operationKey)).get();
    if(previous){if(previous.taskId!==id||previous.fingerprint!==fingerprint)throw new HttpError(409,"conflict","Operation key was already used");return this.byId(id);}
    if(input.expectedRevision!==undefined&&input.expectedRevision!==currentTask.revision)throw new HttpError(409,"conflict","Task changed before completion");
    if(completed&&currentTask.completedAt||!completed&&!currentTask.completedAt)throw new HttpError(409,"conflict","Task state does not allow this action");
    if(!completed&&!input.reason?.trim())throw new HttpError(400,"validation_failed","Reopening needs a reason");
    const stamp = (column: typeof activity.companyId | typeof activity.contactId | typeof activity.dealId | typeof activity.leadId | typeof activity.productId | typeof activity.orderId) => sql`(select ${column} from ${activity} where ${activity.id} = ${id} and ${activity.type} = 'task')`;
    const op = actionGuard(this.db, context, [completed?"task.complete":"task.reopen"], false, sql`exists (select 1 from activity a where a.id=${id}
      and (a.company_id is null or ${modulesEnabledPredicate(["company"])})
      and (a.contact_id is null or ${modulesEnabledPredicate(["contact"])})
      and (a.deal_id is null or ${modulesEnabledPredicate(["deal"])})
      and (a.lead_id is null or ${modulesEnabledPredicate(["lead"])})
      and (a.product_id is null or ${modulesEnabledPredicate(["product"])})
      and (a.order_id is null or ${modulesEnabledPredicate(["order"])}))`);
    const guard=condition(this.db,sql`exists(select 1 from task_record where activity_id=${id} and revision=${currentTask.revision} and ${completed?sql`completed_at is null`:sql`completed_at is not null`})`);
    const overdue=Boolean(currentTask.dueAt&&currentTask.dueAt.getTime()<now.getTime());
    const nextCycle=completed?currentTask.currentCycle:currentTask.currentCycle+1;
    const result={id,completedAt:completed?now.toISOString():null,revision:currentTask.revision+1,cycle:nextCycle,overdueBreached:currentTask.overdueBreached||overdue};
    try {
    await this.db.batch([
      op.begin,
      guard.begin,
      this.db.update(activity).set({ completedAt: completed ? now : null, updatedAt: now }).where(and(eq(activity.id, id), eq(activity.type, "task"))).returning({ id: activity.id }),
      this.db.update(taskRecord).set({completedAt:completed?now:null,currentCycle:nextCycle,overdueBreached:currentTask.overdueBreached||overdue,revision:currentTask.revision+1,updatedAt:now}).where(eq(taskRecord.activityId,id)),
      ...completed?[this.db.update(taskCycle).set({completedAt:now,overdueBreached:currentTask.overdueBreached||overdue}).where(and(eq(taskCycle.taskId,id),eq(taskCycle.cycle,currentTask.currentCycle)))]:[this.db.insert(taskCycle).values({taskId:id,cycle:nextCycle,openedAt:now,openedBy:context.userId,dueAt:currentTask.dueAt,completedAt:null,overdueBreached:false,reopenReason:input.reason!})],
      this.db.insert(taskOperation).values({id:input.operationKey,taskId:id,action:completed?"complete":"reopen",fingerprint,resultJson:JSON.stringify(result),actorId:context.userId,createdAt:now}),
      this.db.update(company).set({ lastActivityAt: sql`max(coalesce(${company.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(company.id, stamp(activity.companyId))),
      this.db.update(contact).set({ lastActivityAt: sql`max(coalesce(${contact.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(contact.id, stamp(activity.contactId))),
      this.db.update(deal).set({ lastActivityAt: sql`max(coalesce(${deal.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(deal.id, stamp(activity.dealId))),
      this.db.update(lead).set({ lastActivityAt: sql`max(coalesce(${lead.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(lead.id, stamp(activity.leadId))),
      this.db.update(product).set({ lastActivityAt: sql`max(coalesce(${product.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(product.id, stamp(activity.productId))),
      this.db.update(salesOrder).set({ lastActivityAt: sql`max(coalesce(${salesOrder.lastActivityAt}, 0), ${now.getTime()})`, updatedAt: now }).where(eq(salesOrder.id, stamp(activity.orderId))),
      guard.end,
      op.end,
    ]);
    return this.byId(id);
    } catch (error) { try{permissionError(error);}catch(original){let current:unknown=original;while(current&&typeof current==="object"){if(current instanceof Error&&current.message.includes("operation_condition"))throw new HttpError(409,"conflict","Task changed before completion");current="cause" in current?current.cause:null;}throw original;} }
  }
}
