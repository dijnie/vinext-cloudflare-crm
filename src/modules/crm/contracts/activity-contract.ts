import { z } from "zod";
import { dealStageSchema } from "./deal-contract";
import { bulkIdsSchema, isoDateTimeSchema, membershipIdSchema, stableIdSchema } from "./list-contract";

export const activityAnchorSchema = z.object({
  companyId: stableIdSchema.nullable().optional(),
  contactId: stableIdSchema.nullable().optional(),
  dealId: stableIdSchema.nullable().optional(),
});
export const activityCreateInputSchema = activityAnchorSchema.extend({
  type: z.enum(["note", "call", "meeting", "task"]),
  subject: z.string().trim().max(300).nullable().optional(),
  content: z.string().trim().max(10_000).nullable().optional(),
  occurredAt: isoDateTimeSchema.optional(),
  dueAt: isoDateTimeSchema.nullable().optional(),
}).strict().superRefine((input, ctx) => {
  if (!input.companyId && !input.contactId && !input.dealId) ctx.addIssue({ code: "custom", path: ["companyId"], message: "An activity needs a record" });
  if (input.type === "task" && !input.subject) ctx.addIssue({ code: "custom", path: ["subject"], message: "A task needs a subject" });
  if (input.type !== "task" && input.dueAt) ctx.addIssue({ code: "custom", path: ["dueAt"], message: "Only tasks have due dates" });
});
export const activityCompleteInputSchema = z.object({ completed: z.boolean() }).strict();
export const activityFilterSchema = z.enum(["all", "history", "notes", "calls", "meetings", "upcoming", "done"]);
export const timelineInputSchema = z.object({
  entity: z.enum(["company", "contact", "deal"]), recordId: stableIdSchema,
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
  companyId: stableIdSchema.nullable(), contactId: stableIdSchema.nullable(), dealId: stableIdSchema.nullable(),
  author: z.object({ id: z.string(), name: z.string(), email: z.email() }),
  metadata: stageChangeMetadataSchema.nullable(), createdAt: isoDateTimeSchema, updatedAt: isoDateTimeSchema,
});
export const timelineOutputSchema = z.object({ entries: z.array(activityEntryOutputSchema), nextCursor: z.string().nullable() });
export const ownershipInputSchema = z.object({
  entity: z.enum(["company", "contact", "deal"]), ids: bulkIdsSchema,
  ownerMembershipId: membershipIdSchema.nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.entity === "deal" && !value.ownerMembershipId) ctx.addIssue({ code: "custom", path: ["ownerMembershipId"], message: "Deals need an owner" });
});
export type ActivityCreateInput = z.infer<typeof activityCreateInputSchema>;
export type TimelineInput = z.infer<typeof timelineInputSchema>;
export type ActivityEntry = z.infer<typeof activityEntryOutputSchema>;
export type OwnershipInput = z.infer<typeof ownershipInputSchema>;
