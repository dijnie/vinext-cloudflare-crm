import {z} from "zod";
import {isoDateTimeSchema,membershipIdSchema,stableIdSchema} from "@/lib/listing/list-contract";
export const ticketCreateInputSchema=z.object({operationKey:stableIdSchema,subject:z.string().trim().min(1).max(300),description:z.string().trim().max(10_000).nullable().optional(),priority:z.enum(["low","normal","high","urgent"]).default("normal"),category:z.string().trim().max(120).nullable().optional(),source:z.string().trim().min(1).max(120).default("manual"),contactId:stableIdSchema.nullable().optional(),companyId:stableIdSchema.nullable().optional(),assigneeMembershipId:membershipIdSchema.nullable().optional(),collaboratorMembershipIds:z.array(membershipIdSchema).max(50).default([]),dueAt:isoDateTimeSchema.nullable().optional()}).strict();
export const ticketListInputSchema=z.object({scope:z.enum(["mine","all"]).default("mine"),status:z.enum(["open","resolved","all"]).default("open"),limit:z.coerce.number().int().min(1).max(100).default(50)}).strict();
const operation=z.object({operationKey:stableIdSchema,expectedRevision:z.number().int().nonnegative()});
export const ticketCommandInputSchema=z.discriminatedUnion("action",[
 operation.extend({action:z.literal("respond"),content:z.string().trim().min(1).max(10_000)}).strict(),
 operation.extend({action:z.literal("deadline"),dueAt:isoDateTimeSchema.nullable(),reason:z.string().trim().min(1).max(500)}).strict(),
 operation.extend({action:z.literal("assign"),assigneeMembershipId:membershipIdSchema.nullable()}).strict(),
 operation.extend({action:z.literal("collaborators"),collaboratorMembershipIds:z.array(membershipIdSchema).max(50)}).strict(),
 operation.extend({action:z.literal("resolve")}).strict(),
 operation.extend({action:z.literal("reopen"),reason:z.string().trim().min(1).max(500)}).strict(),
]);
export const ticketEventSchema=z.object({id:stableIdSchema,ticketId:stableIdSchema,cycle:z.number().int(),action:z.enum(["created","response","deadline","assign","resolve","reopen","collaborators"]),content:z.string().nullable(),previousDueAt:isoDateTimeSchema.nullable(),nextDueAt:isoDateTimeSchema.nullable(),actorId:z.string(),operationKey:stableIdSchema,createdAt:isoDateTimeSchema});
export const ticketRowSchema=z.object({id:stableIdSchema,number:z.number().int(),subject:z.string(),description:z.string().nullable(),priority:z.enum(["low","normal","high","urgent"]),category:z.string().nullable(),source:z.string(),contactId:stableIdSchema.nullable(),companyId:stableIdSchema.nullable(),assigneeMembershipId:z.string().nullable(),collaboratorMembershipIds:z.array(z.string()),status:z.enum(["open","resolved"]),cycle:z.number().int(),dueAt:isoDateTimeSchema.nullable(),firstResponseAt:isoDateTimeSchema.nullable(),overdue:z.boolean(),overdueBreached:z.boolean(),revision:z.number().int(),createdAt:isoDateTimeSchema,updatedAt:isoDateTimeSchema});
export const ticketDetailSchema=ticketRowSchema.extend({events:z.array(ticketEventSchema)});
export const ticketListOutputSchema=z.object({rows:z.array(ticketRowSchema)});
export type TicketCreateInput=z.infer<typeof ticketCreateInputSchema>;export type TicketListInput=z.infer<typeof ticketListInputSchema>;export type TicketCommandInput=z.infer<typeof ticketCommandInputSchema>;
