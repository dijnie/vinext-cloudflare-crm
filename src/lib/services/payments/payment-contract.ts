import {z} from "zod";
import {moneySchema} from "../orders/order-contract";
import {businessCommandShape,orderOperationOutputSchema} from "../orders/order-command-contract";
export const paymentInputSchema=z.object({...businessCommandShape,kind:z.enum(["collection","refund"]),amountMinor:moneySchema.refine(n=>n>0),method:z.string().trim().min(1).max(100),reference:z.string().trim().max(200).optional()}).strict();
export const paymentOutputSchema=z.object({id:z.uuid(),orderId:z.uuid(),operationId:z.uuid(),kind:z.enum(["collection","refund"]),amountMinor:moneySchema,currency:z.string(),method:z.string(),reference:z.string().nullable(),actorId:z.string(),actorName:z.string().nullable(),businessDate:z.string(),timeZone:z.string(),reason:z.string().nullable(),createdAt:z.iso.datetime()});
export const paymentListOutputSchema=z.object({rows:z.array(paymentOutputSchema)});export const paymentResultOutputSchema=orderOperationOutputSchema;
export type PaymentInput=z.infer<typeof paymentInputSchema>;
