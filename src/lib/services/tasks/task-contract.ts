import {z} from "zod";
import {activityAnchorSchema} from "../activities/activity-contract";
import {isoDateTimeSchema,membershipIdSchema,stableIdSchema} from "@/lib/listing/list-contract";

export const taskCreateInputSchema=activityAnchorSchema.extend({subject:z.string().trim().min(1).max(300),content:z.string().trim().max(10_000).nullable().optional(),dueAt:isoDateTimeSchema.nullable().optional(),assigneeMembershipId:membershipIdSchema.nullable().optional()}).strict();
export const taskListInputSchema=z.object({scope:z.enum(["mine","all"]).default("mine"),state:z.enum(["open","completed","all"]).default("open"),limit:z.coerce.number().int().min(1).max(100).default(50)}).strict();
const operation=z.object({operationKey:stableIdSchema,expectedRevision:z.number().int().nonnegative()});
export const taskCommandInputSchema=z.discriminatedUnion("action",[
 operation.extend({action:z.literal("complete")}).strict(),
 operation.extend({action:z.literal("reopen"),reason:z.string().trim().min(1).max(500)}).strict(),
 operation.extend({action:z.literal("deadline"),dueAt:isoDateTimeSchema.nullable(),reason:z.string().trim().min(1).max(500)}).strict(),
 operation.extend({action:z.literal("assign"),assigneeMembershipId:membershipIdSchema.nullable()}).strict(),
]);
export const taskRowSchema=z.object({id:stableIdSchema,subject:z.string(),content:z.string().nullable(),assigneeMembershipId:z.string().nullable(),assigneeName:z.string().nullable(),dueAt:isoDateTimeSchema.nullable(),completedAt:isoDateTimeSchema.nullable(),overdue:z.boolean(),overdueBreached:z.boolean(),revision:z.number().int(),cycle:z.number().int(),companyId:stableIdSchema.nullable(),contactId:stableIdSchema.nullable(),dealId:stableIdSchema.nullable(),leadId:stableIdSchema.nullable(),productId:stableIdSchema.nullable(),orderId:stableIdSchema.nullable(),createdAt:isoDateTimeSchema,updatedAt:isoDateTimeSchema});
export const taskListOutputSchema=z.object({rows:z.array(taskRowSchema)});
export const taskDetailOutputSchema=taskRowSchema.extend({cycles:z.array(z.object({taskId:stableIdSchema,cycle:z.number().int(),openedAt:isoDateTimeSchema,openedBy:z.string(),dueAt:isoDateTimeSchema.nullable(),completedAt:isoDateTimeSchema.nullable(),overdueBreached:z.boolean(),reopenReason:z.string().nullable()})),deadlines:z.array(z.object({id:stableIdSchema,taskId:stableIdSchema,cycle:z.number().int(),previousDueAt:isoDateTimeSchema.nullable(),nextDueAt:isoDateTimeSchema.nullable(),reason:z.string(),actorId:z.string(),operationKey:stableIdSchema,createdAt:isoDateTimeSchema}))});
export type TaskCreateInput=z.infer<typeof taskCreateInputSchema>;
export type TaskListInput=z.infer<typeof taskListInputSchema>;
export type TaskCommandInput=z.infer<typeof taskCommandInputSchema>;
