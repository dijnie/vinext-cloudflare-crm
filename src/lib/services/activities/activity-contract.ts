import { z } from "zod";
import { dealStageSchema } from "../deals/deal-stage-contracts";
import { bulkIdsSchema, isoDateTimeSchema, membershipIdSchema, stableIdSchema } from "../../listing/list-contract";

export const activityAnchorSchema = z.object({
  companyId: stableIdSchema.nullable().optional(),
  contactId: stableIdSchema.nullable().optional(),
  dealId: stableIdSchema.nullable().optional(),
  leadId: stableIdSchema.nullable().optional(),
  productId: stableIdSchema.nullable().optional(),
  orderId: stableIdSchema.nullable().optional(),
});
export const activityCreateInputSchema = activityAnchorSchema.extend({
  type: z.enum(["note", "call", "meeting", "task"]),
  subject: z.string().trim().max(300).nullable().optional(),
  content: z.string().trim().max(10_000).nullable().optional(),
  occurredAt: isoDateTimeSchema.optional(),
  dueAt: isoDateTimeSchema.nullable().optional(),
  assigneeMembershipId: membershipIdSchema.nullable().optional(),
}).strict().superRefine((input, ctx) => {
  if (!input.companyId && !input.contactId && !input.dealId && !input.leadId && !input.productId && !input.orderId) ctx.addIssue({ code: "custom", path: ["companyId"], message: "An activity needs a record" });
  if (input.leadId && (input.companyId || input.contactId || input.dealId || input.productId || input.orderId)) ctx.addIssue({ code: "custom", path: ["leadId"], message: "Lead activities have a single lead anchor" });
  if (input.productId && (input.companyId || input.contactId || input.dealId || input.leadId || input.orderId)) ctx.addIssue({ code: "custom", path: ["productId"], message: "Product activities have a single product anchor" });
  if (input.orderId && (input.companyId || input.contactId || input.dealId || input.leadId || input.productId)) ctx.addIssue({ code: "custom", path: ["orderId"], message: "Order activities have a single order anchor" });
  if (input.type === "task" && !input.subject) ctx.addIssue({ code: "custom", path: ["subject"], message: "A task needs a subject" });
  if (input.type !== "task" && input.dueAt) ctx.addIssue({ code: "custom", path: ["dueAt"], message: "Only tasks have due dates" });
  if (input.type !== "task" && input.assigneeMembershipId) ctx.addIssue({ code: "custom", path: ["assigneeMembershipId"], message: "Only tasks have assignees" });
});
export const activityCompleteInputSchema = z.object({ completed: z.boolean(), reason: z.string().trim().min(1).max(500).optional(), operationKey: stableIdSchema.optional(), expectedRevision: z.number().int().nonnegative().optional() }).strict().superRefine((value,ctx)=>{if(!value.completed&&!value.reason)ctx.addIssue({code:"custom",path:["reason"],message:"Reopening needs a reason"});});
export const activityFilterSchema = z.enum(["all", "history", "notes", "calls", "meetings", "upcoming", "done"]);
export const timelineInputSchema = z.object({
  entity: z.enum(["company", "contact", "deal", "lead", "product", "order"]), recordId: stableIdSchema,
  filter: activityFilterSchema.default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().regex(/^\d{1,15}:[0-9a-f-]{36}$/i).max(52).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.cursor && (!stableIdSchema.safeParse(value.cursor.split(":")[1]).success || !Number.isSafeInteger(Number(value.cursor.split(":")[0])))) ctx.addIssue({ code: "custom", path: ["cursor"], message: "Invalid cursor" });
});
export const stageChangeMetadataSchema = z.object({ fromStageId: dealStageSchema, toStageId: dealStageSchema }).strict();
export const activityEntryOutputSchema = z.object({
  id: stableIdSchema, type: z.enum(["note", "call", "meeting", "task", "stage_change"]),
  subject: z.string().nullable(), content: z.string().nullable(),
  occurredAt: isoDateTimeSchema.nullable(), dueAt: isoDateTimeSchema.nullable(), completedAt: isoDateTimeSchema.nullable(),
  companyId: stableIdSchema.nullable(), contactId: stableIdSchema.nullable(), dealId: stableIdSchema.nullable(), leadId: stableIdSchema.nullable(), productId: stableIdSchema.nullable(), orderId: stableIdSchema.nullable(),
  author: z.object({ id: z.string(), name: z.string(), email: z.email() }),
  metadata: stageChangeMetadataSchema.nullable(), createdAt: isoDateTimeSchema, updatedAt: isoDateTimeSchema,
});
export const timelineOutputSchema = z.object({ entries: z.array(activityEntryOutputSchema), nextCursor: z.string().nullable() });
export const ownershipInputSchema = z.object({
  entity: z.enum(["company", "contact", "deal", "lead", "product", "order"]), ids: bulkIdsSchema,
  ownerMembershipId: membershipIdSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.entity === "deal" && !value.ownerMembershipId) ctx.addIssue({ code: "custom", path: ["ownerMembershipId"], message: "Deals need an owner" });
});
export type ActivityCreateInput = z.infer<typeof activityCreateInputSchema>;
export type TimelineInput = z.infer<typeof timelineInputSchema>;
export type ActivityEntry = z.infer<typeof activityEntryOutputSchema>;
export type OwnershipInput = z.infer<typeof ownershipInputSchema>;
