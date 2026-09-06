import {and,eq,sql,type SQL} from "drizzle-orm";
import type {AppDatabase} from "@/lib/db/database";
import {product,productVariant,productPackageComponent,variantFulfillment} from "@/lib/db/schema";
import {HttpError} from "@/lib/http/http-errors";
import {MAX_AMOUNT_MINOR} from "../currencies/currency-catalog";
import type {OrderCreateInput,OrderComponent,OrderLine} from "./order-contract";
import {conflict} from "./order-operations";
export function bounded(amount:bigint){if(amount<0n||amount>BigInt(MAX_AMOUNT_MINOR))throw new HttpError(400,"validation_failed","Amount is outside supported bounds");return Number(amount);}
export async function preparePricing(db:AppDatabase,input:OrderCreateInput){
 const guards:SQL[]=[],lines:OrderLine[]=[];
 async function component(id:string,quantity:number,parents:Set<string>,inPackage:boolean):Promise<OrderComponent[]>{
  if(parents.size>10)throw new HttpError(400,"validation_failed","Package nesting limit exceeded");
  const row=await db.select({variant:productVariant,product}).from(productVariant).innerJoin(product,eq(product.id,productVariant.productId)).where(eq(productVariant.id,id)).get();if(!row||row.variant.archivedAt||row.product.archivedAt)conflict("Catalog selection is unavailable");
  const {variant:v,product:p}=row;guards.push(sql`exists(select 1 from product_variant v join product p on p.id=v.product_id where v.id=${id} and v.revision=${v.revision} and p.revision=${p.revision} and v.archived_at is null and p.archived_at is null)`);
  if(p.kind==="package"){
   if(parents.has(p.id))conflict("Package cycle");const next=new Set(parents).add(p.id);const parts=await db.select().from(productPackageComponent).where(eq(productPackageComponent.packageProductId,p.id));if(!parts.length)throw new HttpError(400,"validation_failed","Package needs components");
   const result:OrderComponent[]=[{variantId:id,productId:p.id,kind:p.kind,label:`${p.name} — ${v.label}`,quantity,variantRevision:v.revision,productRevision:p.revision,costMinor:v.costMinor,sessionUnits:0,expiryDays:null,fulfillmentRevision:-1}];for(const part of parts){const multiplied=BigInt(quantity)*BigInt(part.quantity);if(multiplied>1_000_000n)throw new HttpError(400,"validation_failed","Package quantity is too large");result.push(...await component(part.componentVariantId,Number(multiplied),next,true));if(result.length>100)throw new HttpError(400,"validation_failed","Package component limit exceeded");}return result;
  }
  const fulfillment=await db.select().from(variantFulfillment).where(eq(variantFulfillment.variantId,id)).get();guards.push(fulfillment?sql`exists(select 1 from variant_fulfillment where variant_id=${id} and revision=${fulfillment.revision})`:sql`not exists(select 1 from variant_fulfillment where variant_id=${id})`);
  if(inPackage&&p.kind==="service"&&!fulfillment?.sessionUnits)throw new HttpError(400,"validation_failed","Configure service session units before selling this package");
  return [{variantId:id,productId:p.id,kind:p.kind,label:`${p.name} — ${v.label}`,quantity,variantRevision:v.revision,productRevision:p.revision,costMinor:v.costMinor,sessionUnits:fulfillment?.sessionUnits??0,expiryDays:fulfillment?.expiryDays??null,fulfillmentRevision:fulfillment?.revision??-1}];
 }
 for(const line of input.lines){const row=await db.select({variant:productVariant,product}).from(productVariant).innerJoin(product,eq(product.id,productVariant.productId)).where(eq(productVariant.id,line.variantId)).get();if(!row||row.variant.revision!==line.expectedVariantRevision||row.product.revision!==line.expectedProductRevision||row.variant.currency!==input.currency)conflict("Catalog price or currency changed");
  const price=line.unitPriceMinor??row.variant.priceMinor,total=BigInt(price)*BigInt(line.quantity)-BigInt(line.discountMinor);const components=await component(line.variantId,line.quantity,new Set(),false);
  lines.push({...line,id:crypto.randomUUID(),productId:row.product.id,name:row.product.name,label:row.variant.label,sku:row.variant.sku,kind:row.product.kind,unitPriceMinor:price,costMinor:row.variant.costMinor,currency:input.currency,durationMinutes:row.variant.durationMinutes,attributes:JSON.parse(row.variant.attributesJson),totalMinor:bounded(total),components});
 }
 const goodsMinor=bounded(lines.reduce((sum,line)=>sum+BigInt(line.totalMinor),0n));if(input.discountMinor>goodsMinor)throw new HttpError(400,"validation_failed","Discount exceeds goods amount");const originalMinor=bounded(BigInt(goodsMinor)-BigInt(input.discountMinor)+BigInt(input.surchargeMinor)+BigInt(input.taxMinor));
 return {preview:{lines,goodsMinor,discountMinor:input.discountMinor,surchargeMinor:input.surchargeMinor,taxMinor:input.taxMinor,originalMinor,currency:input.currency},predicate:and(...guards)??sql`1=1`};
}
export function snapshotPredicate(lines:OrderLine[]){const seen=new Map<string,OrderComponent>();for(const line of lines){for(const c of line.components)seen.set(c.variantId,c);}const guards=[...lines.map(l=>sql`exists(select 1 from product_variant v join product p on p.id=v.product_id where v.id=${l.variantId} and v.revision=${l.expectedVariantRevision} and p.revision=${l.expectedProductRevision} and v.archived_at is null and p.archived_at is null)`),...Array.from(seen.values()).map(c=>sql`exists(select 1 from product_variant v join product p on p.id=v.product_id where v.id=${c.variantId} and v.revision=${c.variantRevision} and p.revision=${c.productRevision} and v.archived_at is null and p.archived_at is null)`),...Array.from(seen.values()).filter(c=>c.kind!=="package").map(c=>c.fulfillmentRevision<0?sql`not exists(select 1 from variant_fulfillment where variant_id=${c.variantId})`:sql`exists(select 1 from variant_fulfillment where variant_id=${c.variantId} and revision=${c.fulfillmentRevision})`)];return and(...guards)??sql`1=1`;}
