import {z} from "zod";
import {isoDateTimeSchema,stableIdSchema} from "@/lib/listing/list-contract";
export const notificationRowSchema=z.object({id:stableIdSchema,kind:z.enum(["appointment","task","ticket"]),sourceId:stableIdSchema,dueAt:isoDateTimeSchema,title:z.string(),body:z.string().nullable(),targetUrl:z.string(),state:z.enum(["pending","delivered","failed"]),attempts:z.number().int(),lastError:z.string().nullable(),readAt:isoDateTimeSchema.nullable(),browserRetryReady:z.boolean()});
export const notificationListOutputSchema=z.object({browserEnabled:z.boolean(),rows:z.array(notificationRowSchema)});
export const notificationActionSchema=z.discriminatedUnion("action",[z.object({action:z.literal("read"),id:stableIdSchema}).strict(),z.object({action:z.literal("browser-result"),id:stableIdSchema,delivered:z.boolean(),error:z.string().trim().max(200).optional()}).strict()]);
export const notificationPreferenceSchema=z.object({inAppEnabled:z.boolean(),browserEnabled:z.boolean(),appointmentOffsetMinutes:z.number().int().min(0).max(525600),taskOffsetMinutes:z.number().int().min(0).max(525600),ticketOffsetMinutes:z.number().int().min(0).max(525600),revision:z.number().int()});
export const notificationPreferenceInputSchema=notificationPreferenceSchema.strict();
export type NotificationAction=z.infer<typeof notificationActionSchema>;export type NotificationPreferenceInput=z.infer<typeof notificationPreferenceInputSchema>;
