import {desc,eq} from "drizzle-orm";
import type {AppDatabase} from "@/lib/db/database";
import {salesOrder,orderPayment,orderOperation,user} from "@/lib/db/schema";
import type {RequestContext} from "@/lib/http/request-context";
import {requirePermission} from "../permissions/permission-policy";
import {balance,conflict,fingerprint,replay,salesError,startOperation} from "../orders/order-operations";
import {bounded} from "../orders/order-pricing";
import {paymentInputSchema,type PaymentInput} from "./payment-contract";
export class PaymentService{
 constructor(private readonly db:AppDatabase){}
 async record(context:RequestContext,id:string,raw:PaymentInput){const input=paymentInputSchema.parse(raw),digest=await fingerprint(id,input),previous=await replay(this.db,context,id,input.operationKey,digest);if(previous)return previous;const {row,calendar,auth,guard}=await startOperation(this.db,context,id,input,[input.kind==="collection"?"order.collect":"order.refund"],digest);if(row.state==="draft"||row.state==="cancelled"&&input.kind==="collection")conflict("Confirm the order before recording collections");const next={...row};if(input.kind==="collection")next.collectedMinor=bounded(BigInt(row.collectedMinor)+BigInt(input.amountMinor));else{if(input.amountMinor>row.collectedMinor-row.refundedMinor)conflict("Refund exceeds net collections");next.refundedMinor=row.refundedMinor+input.amountMinor;}const result={id,operationKey:input.operationKey,revision:row.revision+1,state:row.state,balanceMinor:balance(next)};
 try{await this.db.batch([auth.begin,guard.begin,this.db.insert(orderOperation).values({id:input.operationKey,orderId:id,action:input.kind,fingerprint:digest,resultJson:JSON.stringify(result),actorId:context.userId,businessDate:calendar.date,timeZone:calendar.timeZone,reason:input.reason??null,createdAt:calendar.now}),this.db.insert(orderPayment).values({id:crypto.randomUUID(),orderId:id,operationId:input.operationKey,kind:input.kind,amountMinor:input.amountMinor,currency:row.currency,method:input.method,reference:input.reference??null,actorId:context.userId,businessDate:calendar.date,timeZone:calendar.timeZone,reason:input.reason??null,createdAt:calendar.now}),this.db.update(salesOrder).set({revision:row.revision+1,updatedAt:calendar.now}).where(eq(salesOrder.id,id)),guard.end,auth.end]);return result;}catch(e){const p=await replay(this.db,context,id,input.operationKey,digest);if(p)return p;salesError(e);}
 }
 async list(context:RequestContext,id:string){await requirePermission(this.db,context);const rows=await this.db.select({payment:orderPayment,actorName:user.name}).from(orderPayment).leftJoin(user,eq(user.id,orderPayment.actorId)).where(eq(orderPayment.orderId,id)).orderBy(desc(orderPayment.createdAt),desc(orderPayment.id)).limit(100);return{rows:rows.map(({payment,actorName})=>({...payment,actorName,createdAt:payment.createdAt.toISOString()}))};}
}
