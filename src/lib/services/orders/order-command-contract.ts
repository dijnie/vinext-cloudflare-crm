import {z} from "zod";
import {moneySchema,orderStateSchema} from "./order-contract";
export const businessCommandShape={operationKey:z.uuid(),expectedRevision:z.number().int().nonnegative(),calendarRevision:z.number().int().nonnegative(),businessDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),reason:z.string().trim().max(2000).optional()};
export const orderCommandInputSchema=z.discriminatedUnion("action",[
 z.object({...businessCommandShape,action:z.enum(["confirm","complete","cancel"])}).strict(),
 z.object({...businessCommandShape,action:z.literal("adjust"),reason:z.string().trim().min(1).max(2000),goodsMinor:moneySchema.default(0),surchargeMinor:moneySchema.default(0),taxMinor:moneySchema.default(0)}).strict(),
]);
export const orderOperationOutputSchema=z.object({id:z.uuid(),operationKey:z.uuid(),revision:z.number().int(),state:orderStateSchema,balanceMinor:z.string().regex(/^-?\d+$/)});
export type OrderCommandInput=z.infer<typeof orderCommandInputSchema>;
export const orderOperationHistoryOutputSchema=z.object({rows:z.array(z.object({id:z.uuid(),orderId:z.uuid(),action:z.string(),adjustment:z.object({goodsMinor:moneySchema,surchargeMinor:moneySchema,taxMinor:moneySchema}).nullable(),result:orderOperationOutputSchema,actorId:z.string(),actorName:z.string().nullable(),businessDate:z.string(),timeZone:z.string(),reason:z.string().nullable(),createdAt:z.iso.datetime()}))});
