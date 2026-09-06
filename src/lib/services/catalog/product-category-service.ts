import { asc,eq,sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { productCategory,productCategoryRevision } from "@/lib/db/schema";
import type { RequestContext } from "@/lib/http/request-context";
import { HttpError } from "@/lib/http/http-errors";
import { toIso } from "@/lib/listing/list-contract";
import { actionGuard,permissionPredicate,requirePermission } from "../permissions/permission-policy";
import { productCategoryMutationSchema,type ProductCategoryMutation } from "./product-category-contract";
import { ProductRepository } from "./product-repository";
import { catalogWriteError } from "./catalog-errors";
export class ProductCategoryService {
 constructor(private readonly db:AppDatabase){}
 async get(context:RequestContext){
  await requirePermission(this.db,context);
  const [categories,[revision]]=await this.db.batch([this.db.select().from(productCategory).where(permissionPredicate(context)).orderBy(asc(productCategory.position),asc(productCategory.id)),this.db.select({revision:productCategoryRevision.revision,canManage:sql<number>`${permissionPredicate(context,[],true)}`}).from(productCategoryRevision).where(eq(productCategoryRevision.id,"categories"))]);
  if(!revision)throw new Error("Category settings unavailable");
  await requirePermission(this.db,context);
  return {revision:revision.revision,canManage:Boolean(revision.canManage),categories:categories.map(row=>({...row,archivedAt:toIso(row.archivedAt)}))};
 }
 async mutate(context:RequestContext,raw:ProductCategoryMutation){
  await requirePermission(this.db,context,[],true);
  const parsed=productCategoryMutationSchema.safeParse(raw);if(!parsed.success)throw new HttpError(400,"validation_failed","Invalid category configuration");
  const input=parsed.data,catalog=await this.get(context);
  if(catalog.revision!==input.revision)throw new HttpError(409,"conflict","Categories changed; reload before saving");
  const statements:Parameters<AppDatabase["batch"]>[0][number][]=[];
  if(input.action==="create")statements.push(this.db.insert(productCategory).values({id:crypto.randomUUID(),label:input.label,position:Math.max(0,...catalog.categories.map(row=>row.position))+10}));
  else{
   if(!catalog.categories.some(row=>row.id===input.id))throw new HttpError(404,"not_found","Category was not found");
   if(input.action==="relabel")statements.push(this.db.update(productCategory).set({label:input.label,revision:sql`${productCategory.revision}+1`}).where(eq(productCategory.id,input.id)));
   else if(input.action==="reorder"){
    if(input.beforeId===input.id || input.beforeId!==null&&!catalog.categories.some(row=>row.id===input.beforeId))throw new HttpError(400,"validation_failed","Reorder target is invalid");
    const ids=catalog.categories.map(row=>row.id).filter(id=>id!==input.id);ids.splice(input.beforeId===null?ids.length:ids.indexOf(input.beforeId),0,input.id);
    const positions=JSON.stringify(ids.map((id,index)=>({id,position:(index+1)*10}))),offset=Math.max(ids.length*10,...catalog.categories.map(row=>row.position))+10;
    statements.push(this.db.update(productCategory).set({position:sql`${productCategory.position}+${offset}`}));
    statements.push(this.db.update(productCategory).set({position:sql<number>`(select json_extract(item.value,'$.position') from json_each(${positions}) item where json_extract(item.value,'$.id')=${productCategory.id})`,revision:sql`${productCategory.revision}+1`}));
   }else statements.push(this.db.update(productCategory).set({archivedAt:input.action==="archive"?new Date():null,revision:sql`${productCategory.revision}+1`}).where(eq(productCategory.id,input.id)));
  }
  const auth=actionGuard(this.db,context,[],true),guard=new ProductRepository(this.db).condition(sql`exists(select 1 from product_category_revision where id='categories' and revision=${input.revision})`);
  try{await this.db.batch([auth.begin,guard.begin,...statements,guard.end,auth.end]);}catch(error){catalogWriteError(error);}
  return this.get(context);
 }
}
