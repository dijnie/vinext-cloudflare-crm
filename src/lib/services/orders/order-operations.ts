import {eq,sql,type SQL} from "drizzle-orm";
import type {AppDatabase} from "@/lib/db/database";
import {crmSetting,operationConditionGuard,orderOperation,salesOrder} from "@/lib/db/schema";
import type {RequestContext} from "@/lib/http/request-context";
import {HttpError} from "@/lib/http/http-errors";
import {actionGuard,permissionError,requirePermission} from "../permissions/permission-policy";
import type {Permission} from "../permissions/access-contracts";
import {businessDate,businessDayBounds} from "../settings/business-time";
import {orderOperationOutputSchema} from "./order-command-contract";
export function conflict(message="Order or related state changed; reload before saving"):never{throw new HttpError(409,"conflict",message);}
export function salesError(error:unknown):never{try{permissionError(error);}catch(original){let e=original;while(e&&typeof e==="object"){if(e instanceof Error&&/sales_|operation_conflict|UNIQUE constraint|CHECK constraint|FOREIGN KEY constraint/.test(e.message))conflict();e="cause" in e?e.cause:null;}throw original;}}
export function condition(db:AppDatabase,predicate:SQL){const id=crypto.randomUUID();return {begin:db.insert(operationConditionGuard).values({id,authorized:sql<number>`case when ${predicate} then 1 else 0 end`}),end:db.delete(operationConditionGuard).where(eq(operationConditionGuard.id,id))};}
function canonical(value:unknown):string{if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;if(value&&typeof value==="object")return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;return JSON.stringify(value);}
export async function fingerprint(target:string,input:unknown){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical({target,input})));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,"0")).join("");}
export async function commandDate(db:AppDatabase,context:RequestContext,input:{calendarRevision:number;businessDate?:string;reason?:string}){
 const calendar=await db.select().from(crmSetting).where(eq(crmSetting.id,"settings")).get();if(!calendar||calendar.calendarRevision!==input.calendarRevision)conflict("Business calendar changed");const now=new Date(),today=businessDate(now,calendar.timeZone),date=input.businessDate??today;
 try{businessDayBounds(date,calendar.timeZone);}catch{throw new HttpError(400,"validation_failed","Business date is invalid");}
 if(date>today)throw new HttpError(400,"validation_failed","Future business dates are unavailable");
 const permissions:Permission[]=date<today?["order.backdate"]:[];if(permissions.length&&!input.reason?.trim())throw new HttpError(400,"validation_failed","Backdating needs a reason");await requirePermission(db,context,permissions);
 return {now,date,timeZone:calendar.timeZone,permissions,predicate:sql`exists(select 1 from crm_setting where id='settings' and calendar_revision=${input.calendarRevision})`};
}
export function balance(row:Pick<typeof salesOrder.$inferSelect,"goodsRemainingMinor"|"surchargeRemainingMinor"|"taxRemainingMinor"|"collectedMinor"|"refundedMinor">){return (BigInt(row.goodsRemainingMinor)+BigInt(row.surchargeRemainingMinor)+BigInt(row.taxRemainingMinor)-BigInt(row.collectedMinor)+BigInt(row.refundedMinor)).toString();}
export async function replay(db:AppDatabase,context:RequestContext,id:string,key:string,digest:string){await requirePermission(db,context);const op=await db.select().from(orderOperation).where(eq(orderOperation.id,key)).get();if(!op)return null;if(op.orderId!==id||op.fingerprint!==digest)conflict("Operation key already used for another request");return orderOperationOutputSchema.parse(JSON.parse(op.resultJson));}
export async function startOperation(db:AppDatabase,context:RequestContext,id:string,input:{operationKey:string;expectedRevision:number;calendarRevision:number;businessDate?:string;reason?:string},permissions:Permission[],digest:string){
 await requirePermission(db,context,permissions);const row=await db.select().from(salesOrder).where(eq(salesOrder.id,id)).get();if(!row)throw new HttpError(404,"not_found","Order not found");if(row.revision!==input.expectedRevision||row.archivedAt)conflict();const calendar=await commandDate(db,context,input);const auth=actionGuard(db,context,[...permissions,...calendar.permissions]);const guard=condition(db,sql`exists(select 1 from sales_order where id=${id} and revision=${input.expectedRevision} and archived_at is null) and ${calendar.predicate}`);return {row,calendar,auth,guard,digest};
}
