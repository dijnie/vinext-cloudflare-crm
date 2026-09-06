import {and,desc,eq,sql} from "drizzle-orm";
import type {AppDatabase} from "@/lib/db/database";
import {salesOrder,orderOperation,orderAdjustment,variantFulfillment,inventoryMovement,serviceEntitlement,entitlementMovement,user} from "@/lib/db/schema";
import type {RequestContext} from "@/lib/http/request-context";
import {HttpError} from "@/lib/http/http-errors";
import type {Permission} from "../permissions/access-contracts";
import {requirePermission} from "../permissions/permission-policy";
import type {RecordWriteStatement} from "../shared/record-fields-contract";
import {balance,condition,conflict,fingerprint,replay,salesError,startOperation} from "./order-operations";
import {orderCommandInputSchema,orderOperationOutputSchema,type OrderCommandInput} from "./order-command-contract";
import type {OrderLine,OrderComponent} from "./order-contract";
import {businessDayBounds} from "../settings/business-time";
import {snapshotPredicate} from "./order-pricing";
export class OrderCommandService{
 constructor(private readonly db:AppDatabase){}
 async execute(context:RequestContext,id:string,raw:OrderCommandInput){const input=orderCommandInputSchema.parse(raw),digest=await fingerprint(id,input),previous=await replay(this.db,context,id,input.operationKey,digest);if(previous)return previous;
 const permissions:Permission[]=[`order.${input.action}`];const op=await startOperation(this.db,context,id,input,permissions,digest),{row,calendar,auth,guard}=op;
 if(input.action==="confirm"&&row.state!=="draft"||input.action==="complete"&&row.state!=="confirmed"||input.action==="cancel"&&row.state==="cancelled"||input.action==="adjust"&&!["confirmed","completed"].includes(row.state))conflict("Order state does not allow this action");
 if(input.action==="cancel"&&!input.reason?.trim())throw new HttpError(400,"validation_failed","Cancellation needs a reason");
 const lines=JSON.parse(row.linesJson) as OrderLine[],statements:RecordWriteStatement[]=[],end:RecordWriteStatement[]=[];const next={...row,revision:row.revision+1,updatedAt:calendar.now};
 if(input.action==="confirm"){const catalog=condition(this.db,snapshotPredicate(lines));statements.push(catalog.begin);end.push(catalog.end);next.state="confirmed";next.confirmedAt=calendar.now;next.confirmedDate=calendar.date;next.businessTimeZone=calendar.timeZone;}
 if(input.action==="complete"){
  next.state="completed";next.completedAt=calendar.now;next.completedDate=calendar.date;
  const grouped=new Map<string,OrderComponent>();for(const line of lines)for(const c of line.components){if(c.kind==="package")continue;const prev=grouped.get(c.variantId);grouped.set(c.variantId,{...c,quantity:c.quantity+(prev?.quantity??0)});}
  for(const c of grouped.values()){
   if(c.kind==="product"){
    const stock=await this.db.select().from(variantFulfillment).where(eq(variantFulfillment.variantId,c.variantId)).get();const stockGuard=condition(this.db,stock?sql`exists(select 1 from variant_fulfillment where variant_id=${c.variantId} and revision=${stock.revision} and (stock_tracked=0 or on_hand>=${c.quantity}))`:sql`not exists(select 1 from variant_fulfillment where variant_id=${c.variantId})`);statements.push(stockGuard.begin);end.push(stockGuard.end);
    if(stock?.stockTracked){if(stock.onHand<c.quantity)conflict("Insufficient stock");statements.push(this.db.update(variantFulfillment).set({onHand:stock.onHand-c.quantity,revision:stock.revision+1}).where(eq(variantFulfillment.variantId,c.variantId)),this.db.insert(inventoryMovement).values({id:crypto.randomUUID(),variantId:c.variantId,orderId:id,kind:"sale",quantity:-c.quantity,operationKey:input.operationKey,fingerprint:digest,actorId:context.userId,reason:"Order completion",businessDate:calendar.date,timeZone:calendar.timeZone,createdAt:calendar.now}));}
   }
   if(c.kind==="service"&&c.sessionUnits>0){const granted=c.quantity*c.sessionUnits;if(!Number.isSafeInteger(granted)||granted>1_000_000_000_000)throw new HttpError(400,"validation_failed","Session quantity exceeds supported bounds");const entitlementId=crypto.randomUUID();statements.push(this.db.insert(serviceEntitlement).values({id:entitlementId,orderId:id,contactId:row.contactId,variantId:c.variantId,label:c.label,granted,remaining:granted,expiresAt:c.expiryDays?businessDayBounds(new Date(Date.parse(`${calendar.date}T00:00:00.000Z`)+c.expiryDays*86400000).toISOString().slice(0,10),calendar.timeZone).end:null,createdAt:calendar.now}),this.db.insert(entitlementMovement).values({id:crypto.randomUUID(),entitlementId,kind:"grant",quantity:granted,operationKey:input.operationKey,fingerprint:digest,actorId:context.userId,reason:"Order completion",businessDate:calendar.date,timeZone:calendar.timeZone,createdAt:calendar.now}));}
  }
 }
 let adjustment:{goodsMinor:number;surchargeMinor:number;taxMinor:number}|null=null;
 if(input.action==="adjust"||input.action==="cancel"){
  adjustment=input.action==="adjust"?{goodsMinor:input.goodsMinor,surchargeMinor:input.surchargeMinor,taxMinor:input.taxMinor}:{goodsMinor:row.goodsRemainingMinor,surchargeMinor:row.surchargeRemainingMinor,taxMinor:row.taxRemainingMinor};
  if(adjustment.goodsMinor>row.goodsRemainingMinor||adjustment.surchargeMinor>row.surchargeRemainingMinor||adjustment.taxMinor>row.taxRemainingMinor)conflict("Adjustment exceeds remaining obligation");if(input.action==="adjust"&&adjustment.goodsMinor+adjustment.surchargeMinor+adjustment.taxMinor===0)throw new HttpError(400,"validation_failed","Adjustment must reduce an amount");
  next.goodsRemainingMinor-=adjustment.goodsMinor;next.surchargeRemainingMinor-=adjustment.surchargeMinor;next.taxRemainingMinor-=adjustment.taxMinor;
  if(input.action==="cancel"){next.state="cancelled";next.cancelledAt=calendar.now;next.cancelledDate=calendar.date;const entitlements=await this.db.select().from(serviceEntitlement).where(eq(serviceEntitlement.orderId,id));for(const ent of entitlements){const g=condition(this.db,sql`exists(select 1 from service_entitlement where id=${ent.id} and revision=${ent.revision})`);statements.push(g.begin);end.push(g.end);if(ent.remaining>0)statements.push(this.db.update(serviceEntitlement).set({remaining:0,revoked:ent.revoked+ent.remaining,revision:ent.revision+1}).where(eq(serviceEntitlement.id,ent.id)),this.db.insert(entitlementMovement).values({id:crypto.randomUUID(),entitlementId:ent.id,kind:"revoke",quantity:ent.remaining,operationKey:input.operationKey,fingerprint:digest,actorId:context.userId,reason:input.reason!,businessDate:calendar.date,timeZone:calendar.timeZone,createdAt:calendar.now}));}}
 }
 const result={id,operationKey:input.operationKey,revision:next.revision,state:next.state,balanceMinor:balance(next)};
 try{await this.db.batch([auth.begin,guard.begin,...statements,this.db.insert(orderOperation).values({id:input.operationKey,orderId:id,action:input.action,fingerprint:digest,resultJson:JSON.stringify(result),actorId:context.userId,businessDate:calendar.date,timeZone:calendar.timeZone,reason:input.reason??null,createdAt:calendar.now}),...adjustment?[this.db.insert(orderAdjustment).values({id:crypto.randomUUID(),orderId:id,operationId:input.operationKey,...adjustment,reason:input.reason!,businessDate:calendar.date,timeZone:calendar.timeZone,actorId:context.userId,createdAt:calendar.now})]:[],this.db.update(salesOrder).set({state:next.state,confirmedAt:next.confirmedAt,confirmedDate:next.confirmedDate,completedAt:next.completedAt,completedDate:next.completedDate,cancelledAt:next.cancelledAt,cancelledDate:next.cancelledDate,businessTimeZone:next.businessTimeZone,revision:next.revision,updatedAt:calendar.now}).where(eq(salesOrder.id,id)),...end,guard.end,auth.end]);return result;}catch(e){const p=await replay(this.db,context,id,input.operationKey,digest);if(p)return p;salesError(e);}
 }
 async history(context:RequestContext,id:string){await requirePermission(this.db,context);const rows=await this.db.select({op:orderOperation,adjustment:{goodsMinor:orderAdjustment.goodsMinor,surchargeMinor:orderAdjustment.surchargeMinor,taxMinor:orderAdjustment.taxMinor},actorName:user.name}).from(orderOperation).leftJoin(orderAdjustment,eq(orderAdjustment.operationId,orderOperation.id)).leftJoin(user,eq(user.id,orderOperation.actorId)).where(eq(orderOperation.orderId,id)).orderBy(desc(orderOperation.createdAt),desc(orderOperation.id)).limit(100);return{rows:rows.map(({op:{fingerprint:_f,resultJson,...r},adjustment,actorName})=>({...r,actorName,adjustment,result:orderOperationOutputSchema.parse(JSON.parse(resultJson)),createdAt:r.createdAt.toISOString()}))};}
}
