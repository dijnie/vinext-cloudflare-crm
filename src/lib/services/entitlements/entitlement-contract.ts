import {z} from "zod";
import {businessCommandShape} from "../orders/order-command-contract";
export const entitlementRecordInputSchema=z.object({...businessCommandShape,kind:z.enum(["use","restore"]),quantity:z.number().int().min(1).max(1_000_000),reason:z.string().trim().min(1).max(2000)}).strict();
export const entitlementListInputSchema=z.object({contactId:z.uuid().optional(),orderId:z.uuid().optional(),pageSize:z.coerce.number().int().min(1).max(100).default(50)}).strict();
export const entitlementOutputSchema=z.object({id:z.uuid(),orderId:z.uuid(),contactId:z.uuid(),variantId:z.uuid(),label:z.string(),granted:z.number().int(),remaining:z.number().int(),used:z.number().int(),revoked:z.number().int(),revision:z.number().int(),expiresAt:z.iso.datetime().nullable(),createdAt:z.iso.datetime()});
export const entitlementListOutputSchema=z.object({rows:z.array(entitlementOutputSchema)});
export const entitlementResultOutputSchema=z.object({id:z.uuid(),operationKey:z.uuid(),revision:z.number().int(),remaining:z.number().int(),used:z.number().int()});
export type EntitlementRecordInput=z.infer<typeof entitlementRecordInputSchema>;
export const entitlementHistoryOutputSchema=z.object({rows:z.array(z.object({id:z.uuid(),entitlementId:z.uuid(),kind:z.enum(["grant","use","restore","revoke"]),quantity:z.number().int(),operationKey:z.uuid(),actorId:z.string(),actorName:z.string().nullable(),reason:z.string(),businessDate:z.string(),timeZone:z.string(),createdAt:z.iso.datetime()}))});
