import { and, asc, eq, isNull, like, or, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { product, productCategory, productVariant, singletonMembership } from "@/lib/db/schema";
import type { RequestContext } from "@/lib/http/request-context";
import { HttpError } from "@/lib/http/http-errors";
import { toIso } from "@/lib/listing/list-contract";
import { inJsonArray } from "@/lib/db/sql-filters";
import { actionGuard, authorizedWrite, permissionPredicate, requirePermission } from "../permissions/permission-policy";
import { FieldService } from "../custom-fields/field-service";
import type { PreparedRecordCreation } from "../shared/record-fields-contract";
import { blankToNull } from "../shared/service-utils";
import { ProductRepository } from "./product-repository";
import { catalogWriteError } from "./catalog-errors";
import type { ProductCreateInput,ProductUpdateData,ProductListInput,ProductVariantCreateInput,ProductVariantUpdateInput } from "./product-contract";
export class ProductService {
  private readonly repository:ProductRepository;
  constructor(private readonly db:AppDatabase){this.repository=new ProductRepository(db);}
  async list(context:RequestContext,input:ProductListInput){await requirePermission(this.db,context);const result=await this.repository.list(input);return {...result,rows:result.rows.map(row=>this.serialize(row))};}
  async byId(context:RequestContext,id:string){await requirePermission(this.db,context);const row=await this.repository.byId(id);if(!row)throw new HttpError(404,"not_found","Product was not found");const {variants,packageComponents,...base}=row;return {...this.serialize(base),variants:variants.map(row=>this.serializeVariant(row)),packageComponents:packageComponents.map(row=>({...row,archivedAt:toIso(row.archivedAt),productArchivedAt:toIso(row.productArchivedAt)}))};}
  async create(context:RequestContext,input:ProductCreateInput,creation?:PreparedRecordCreation){
    await requirePermission(this.db,context,["product.create",...(input.ownerMembershipId?["product.assign" as const]:[])]);
    await this.relations(input);
    if(input.kind!=="package" && input.packageComponents?.length)throw new HttpError(400,"validation_failed","Only packages contain components");
    const id=creation?.recordId??crypto.randomUUID(),now=new Date();
    const fields=await new FieldService(this.db).prepareValues(context,{entity:"product",recordId:id,values:input.customFields??{},calendarRevision:input.calendarRevision},"create");
    const auth=actionGuard(this.db,context,["product.create",...(input.ownerMembershipId?["product.assign" as const]:[])]);
    try{await this.db.batch([auth.begin,...creation?.before??[],this.db.insert(product).values({id,name:input.name,kind:input.kind,description:blankToNull(input.description)??null,categoryId:input.categoryId??null,ownerMembershipId:input.ownerMembershipId??null,creatorUserId:context.userId,createdAt:now,updatedAt:now}),this.db.insert(productVariant).values({...this.variantValues(input.initialVariant),id:crypto.randomUUID(),productId:id,isDefault:true,createdAt:now,updatedAt:now}),...await this.repository.components(id,input.packageComponents??[]),...fields.statements,...creation?.after??[],auth.end]);return {id,name:input.name,revision:0};}catch(error){try{fields.translateError(error);}catch(classified){catalogWriteError(classified);}}
  }
  async update(context:RequestContext,id:string,input:ProductUpdateData){
    await requirePermission(this.db,context,["product.update",...(input.ownerMembershipId!==undefined?["product.assign" as const]:[])]);
    const existing=await this.db.select().from(product).where(eq(product.id,id)).get();if(!existing)throw new HttpError(404,"not_found","Product was not found");
    if(existing.revision!==input.expectedRevision)throw new HttpError(409,"conflict","Product changed; reload before saving");
    await this.relations(input,existing.categoryId);
    if(existing.kind!=="package" && input.packageComponents?.length)throw new HttpError(400,"validation_failed","Only packages contain components");
    const fields=await new FieldService(this.db).prepareValues(context,{entity:"product",recordId:id,values:input.customFields??{},calendarRevision:input.calendarRevision});
    const values:Partial<Omit<typeof product.$inferInsert,"revision">> & {revision?:number|SQL}={updatedAt:new Date(),revision:sql`${product.revision}+1`};
    for(const key of ["name","categoryId","ownerMembershipId"] as const)if(input[key]!==undefined)Object.assign(values,{[key]:input[key]});
    if(input.description!==undefined)values.description=blankToNull(input.description);
    const auth=actionGuard(this.db,context,["product.update",...(input.ownerMembershipId!==undefined?["product.assign" as const]:[])]),guard=this.repository.condition(sql`exists(select 1 from product where id=${id} and revision=${input.expectedRevision})`);
    try{await this.db.batch([auth.begin,guard.begin,this.db.update(product).set(values).where(eq(product.id,id)),...input.packageComponents===undefined?[]:await this.repository.components(id,input.packageComponents),...fields.statements,guard.end,auth.end]);return {id,name:input.name??existing.name,revision:input.expectedRevision+1};}catch(error){try{fields.translateError(error);}catch(classified){catalogWriteError(classified);}}
  }
  async archive(context:RequestContext,id:string,restore=false){
    await requirePermission(this.db,context,[restore?"product.restore":"product.archive"]);
    try{const [row]=await authorizedWrite(this.db,context,[restore?"product.restore":"product.archive"],this.db.update(product).set({archivedAt:restore?null:new Date(),revision:sql`${product.revision}+1`,updatedAt:new Date()}).where(eq(product.id,id)).returning());if(!row)throw new HttpError(404,"not_found","Product was not found");return {id:row.id,name:row.name,archivedAt:toIso(row.archivedAt)};}catch(error){catalogWriteError(error);}
  }
  async bulkArchive(context:RequestContext,ids:string[],restore=false){
    try{const result=await authorizedWrite(this.db,context,[restore?"product.restore":"product.archive"],this.db.update(product).set({archivedAt:restore?null:new Date(),revision:sql`${product.revision}+1`,updatedAt:new Date()}).where(inJsonArray(product.id,ids)));return {requested:ids.length,succeeded:result.meta.changes,failed:ids.length-result.meta.changes};}catch(error){catalogWriteError(error);}
  }
  async createVariant(context:RequestContext,productId:string,input:ProductVariantCreateInput){
    await requirePermission(this.db,context,["product.update"]);
    const id=crypto.randomUUID(),now=new Date(),auth=actionGuard(this.db,context,["product.update"]),guard=this.repository.condition(sql`exists(select 1 from product where id=${productId})`);
    try{const result=await this.db.batch([auth.begin,guard.begin,this.db.insert(productVariant).values({...this.variantValues(input),id,productId,isDefault:false,createdAt:now,updatedAt:now}).returning(),this.db.update(product).set({revision:sql`${product.revision}+1`,updatedAt:now}).where(eq(product.id,productId)),guard.end,auth.end]);return this.serializeVariant(result[2][0]!);}catch(error){catalogWriteError(error);}
  }
  async updateVariant(context:RequestContext,productId:string,id:string,input:ProductVariantUpdateInput){
    await requirePermission(this.db,context,["product.update"]);
    const {expectedRevision,...data}=input;const values:Partial<Omit<typeof productVariant.$inferInsert,"revision">> & {revision?:number|SQL}={updatedAt:new Date(),revision:sql`${productVariant.revision}+1`};
    for(const key of ["label","priceMinor","costMinor","currency","durationMinutes"] as const)if(data[key]!==undefined)Object.assign(values,{[key]:data[key]});
    if(data.sku!==undefined)values.sku=data.sku?.replace(/^ +| +$/g,"")||null;
    if(data.attributes!==undefined)values.attributesJson=JSON.stringify(data.attributes);
    return this.writeVariant(context,productId,id,expectedRevision,values);
  }
  async archiveVariant(context:RequestContext,productId:string,id:string,input:{expectedRevision:number;restore?:boolean}){return this.writeVariant(context,productId,id,input.expectedRevision,{archivedAt:input.restore?null:new Date(),updatedAt:new Date(),revision:sql`${productVariant.revision}+1`});}
  private async writeVariant(context:RequestContext,productId:string,id:string,revision:number,values:Partial<Omit<typeof productVariant.$inferInsert,"revision">> & {revision?:number|SQL}){
    await requirePermission(this.db,context,["product.update"]);
    const auth=actionGuard(this.db,context,["product.update"]),guard=this.repository.condition(sql`exists(select 1 from product_variant where id=${id} and product_id=${productId} and revision=${revision})`);
    try{const result=await this.db.batch([auth.begin,guard.begin,this.db.update(productVariant).set(values).where(and(eq(productVariant.id,id),eq(productVariant.productId,productId))).returning(),this.db.update(product).set({revision:sql`${product.revision}+1`,updatedAt:new Date()}).where(eq(product.id,productId)),guard.end,auth.end]);return this.serializeVariant(result[2][0]!);}catch(error){catalogWriteError(error);}
  }
  async variants(context:RequestContext,input:{q?:string;pageSize?:number}={}){
    await requirePermission(this.db,context);const q=(input.q??"").slice(0,200);
    const rows=await this.db.select({variant:productVariant,productName:product.name,kind:product.kind}).from(productVariant).innerJoin(product,eq(product.id,productVariant.productId)).where(and(isNull(product.archivedAt),isNull(productVariant.archivedAt),permissionPredicate(context),q?or(like(product.name,`%${q}%`),like(productVariant.label,`%${q}%`),like(productVariant.sku,`%${q}%`)):undefined)).orderBy(asc(product.name),asc(productVariant.label),asc(productVariant.id)).limit(Math.max(1,Math.min(100,input.pageSize??30)));
    return {rows:rows.map(({variant,...row})=>({...this.serializeVariant(variant),...row}))};
  }
  private variantValues(input:ProductVariantCreateInput){return {label:input.label,sku:input.sku?.replace(/^ +| +$/g,"")||null,priceMinor:input.priceMinor,costMinor:input.costMinor??null,currency:input.currency??"USD",durationMinutes:input.durationMinutes??null,attributesJson:JSON.stringify(input.attributes??{})};}
  private async relations(input:{categoryId?:string|null;ownerMembershipId?:string|null},currentCategory?:string|null){
    if(input.categoryId){const category=await this.db.select().from(productCategory).where(eq(productCategory.id,input.categoryId)).get();if(!category || category.archivedAt && input.categoryId!==currentCategory)throw new HttpError(409,"conflict","Category is unavailable");}
    if(input.ownerMembershipId && !await this.db.select().from(singletonMembership).where(and(eq(singletonMembership.userId,input.ownerMembershipId),eq(singletonMembership.status,"active"))).get())throw new HttpError(400,"validation_failed","Owner must be an active member");
  }
  private serializeVariant(row:typeof productVariant.$inferSelect){const {attributesJson,...value}=row;return {...value,attributes:JSON.parse(attributesJson) as Record<string,string>,archivedAt:toIso(row.archivedAt),createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()};}
  private serialize<T extends {ownerMembershipId:string|null;ownerName:string|null;ownerEmail:string|null;lastActivityAt:Date|null;archivedAt:Date|null;createdAt:Date;updatedAt:Date}>(row:T){const {ownerName,ownerEmail,lastActivityAt,archivedAt,createdAt,updatedAt,...value}=row;return {...value,owner:row.ownerMembershipId?{membershipId:row.ownerMembershipId,name:ownerName,email:ownerEmail}:null,lastActivityAt:toIso(lastActivityAt),archivedAt:toIso(archivedAt),createdAt:createdAt.toISOString(),updatedAt:updatedAt.toISOString()};}
}
