import {z} from "zod";
export const configurationCopySchema=z.object({workspaceName:z.string().trim().min(1).max(120),timeZone:z.string().trim().min(1).max(100),countryCode:z.string().trim().length(2).toUpperCase(),sources:z.array(z.object({id:z.string().trim().regex(/^[a-z0-9][a-z0-9_-]*$/).max(80),label:z.string().trim().min(1).max(120)}).strict()).max(100),workspaceRevision:z.number().int().min(0),calendarRevision:z.number().int().min(0),apply:z.boolean().default(false)}).strict();
export const workspaceMutationSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("rename"),name:z.string().trim().min(1).max(120),expectedRevision:z.number().int().min(0)}).strict(),
 z.object({action:z.literal("copy-configuration"),configuration:configurationCopySchema}).strict(),
 z.object({action:z.literal("schedule-deletion"),confirmation:z.string().max(120)}).strict(),
 z.object({action:z.literal("cancel-deletion")}).strict(),
 z.object({action:z.literal("execute-deletion"),confirmation:z.string().max(120)}).strict(),
 z.object({action:z.literal("retry-deletion")}).strict(),
]);
