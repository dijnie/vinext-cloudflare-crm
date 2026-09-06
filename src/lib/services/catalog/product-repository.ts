import { and, asc, desc, eq, getTableColumns, isNotNull, isNull, like, or, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { product, productVariant, productCategory, productPackageComponent, user, operationConditionGuard } from "@/lib/db/schema";
import { inJsonArray } from "@/lib/db/sql-filters";
import { assertQueryLimits } from "@/lib/db/query-limits";
import { fieldConditionQuery } from "../custom-fields/field-condition-query";
import { customFieldSort } from "../custom-fields/field-sort";
import { fieldFilterConditions, fieldListData, validateFieldFilters } from "../custom-fields/field-list-query";
import type { ProductListInput, ProductPackageComponentInput } from "./product-contract";
export class ProductRepository {
  constructor(readonly db: AppDatabase) {}
  private selection() { return { ...getTableColumns(product), categoryLabel: productCategory.label, ownerName: user.name, ownerEmail: user.email, sku: productVariant.sku, priceMinor: productVariant.priceMinor, costMinor: productVariant.costMinor, currency: productVariant.currency, durationMinutes: productVariant.durationMinutes }; }
  private rows(sortValue?: SQL.Aliased) { return this.db.select({...this.selection(), ...(sortValue ? {internalFieldSortValue:sortValue} : {})}).from(product).innerJoin(productVariant, and(eq(productVariant.productId, product.id),eq(productVariant.isDefault,true))).leftJoin(productCategory,eq(productCategory.id,product.categoryId)).leftJoin(user,eq(user.id,product.ownerMembershipId)); }
  async byId(id:string) {
    const row=await this.rows().where(eq(product.id,id)).get(); if(!row)return null;
    const variants=await this.db.select().from(productVariant).where(eq(productVariant.productId,id)).orderBy(desc(productVariant.isDefault),asc(productVariant.label),asc(productVariant.id));
    const packageComponents=await this.db.select({componentVariantId:productPackageComponent.componentVariantId,quantity:productPackageComponent.quantity,productId:product.id,productName:product.name,variantLabel:productVariant.label,archivedAt:productVariant.archivedAt,productArchivedAt:product.archivedAt}).from(productPackageComponent).innerJoin(productVariant,eq(productVariant.id,productPackageComponent.componentVariantId)).innerJoin(product,eq(product.id,productVariant.productId)).where(eq(productPackageComponent.packageProductId,id)).orderBy(asc(product.name),asc(productVariant.id));
    return {...row,variants,packageComponents};
  }
  async list(input:ProductListInput) {
    await validateFieldFilters(this.db,"product",input.fields);
    const sort=await customFieldSort(this.db,"product",input.sort,input.dir),criteria=await fieldConditionQuery(this.db,"product",input.criteria);
    const where=and(this.where(input),...criteria)!;
    const column=input.sort==="name"?product.name:input.sort==="updatedAt"?product.updatedAt:input.sort==="lastActivityAt"?product.lastActivityAt:input.sort==="archivedAt"?product.archivedAt:product.createdAt;
    const rowsQuery=this.rows(sort?.value).where(where).orderBy(...(sort?.order??[input.dir==="asc"?asc(column):desc(column)]),asc(product.id)).limit(input.pageSize).offset((input.page-1)*input.pageSize);
    const countQuery=this.db.select({total:sql<number>`count(*)`}).from(product).where(where);
    assertQueryLimits(rowsQuery,countQuery);
    const facetWhere=and(this.where({...input,owner:[],category:[],kind:[],fields:{}}),...criteria)!;
    const [rows,[count],facets]=await Promise.all([rowsQuery,countQuery,this.facets(facetWhere)]);
    const fields=await fieldListData(this.db,"product",rows.map(row=>row.id),facetWhere);
    return {rows:rows.map(({internalFieldSortValue: _sort,...row})=>({...row,fields:fields.fieldsByRecord[row.id]??{}})),total:count!.total,facets,customFields:fields.customFields,fieldFacets:fields.fieldFacets,fieldFileLabels:fields.fieldFileLabels,fieldUserLabels:fields.fieldUserLabels,fieldCustomerLabels:fields.fieldCustomerLabels};
  }
  private where(input:ProductListInput) {
    const predicates:SQL[]=[input.archived?isNotNull(product.archivedAt):isNull(product.archivedAt),...fieldFilterConditions("product",input.fields)];
    if(input.q)predicates.push(or(like(product.name,`%${input.q}%`),sql`exists(select 1 from product_variant where product_id=${product.id} and (sku like ${`%${input.q}%`} or label like ${`%${input.q}%`}))`)!);
    if(input.category.length)predicates.push(inJsonArray(product.categoryId,input.category));
    if(input.kind.length)predicates.push(inJsonArray(product.kind,input.kind));
    if(input.owner.length){const assigned=input.owner.filter(id=>id!=="unassigned");predicates.push(input.owner.includes("unassigned")?or(isNull(product.ownerMembershipId),assigned.length?inJsonArray(product.ownerMembershipId,assigned):sql`0=1`)!:inJsonArray(product.ownerMembershipId,assigned));}
    return and(...predicates)!;
  }
  private async facets(where:SQL) {
    const [category,kind,owner]=await Promise.all([
      this.db.select({value:productCategory.id,label:productCategory.label,count:sql<number>`count(*)`}).from(product).innerJoin(productCategory,eq(productCategory.id,product.categoryId)).where(where).groupBy(productCategory.id),
      this.db.select({value:product.kind,label:product.kind,count:sql<number>`count(*)`}).from(product).where(where).groupBy(product.kind),
      this.db.select({value:sql<string>`coalesce(${product.ownerMembershipId},'unassigned')`,label:sql<string>`coalesce(${user.name},'common.unassigned')`,count:sql<number>`count(*)`}).from(product).leftJoin(user,eq(user.id,product.ownerMembershipId)).where(where).groupBy(product.ownerMembershipId),
    ]);return {category,kind,owner};
  }
  condition(predicate:SQL) {const id=crypto.randomUUID();return {begin:this.db.insert(operationConditionGuard).values({id,authorized:sql<number>`case when ${predicate} then 1 else 0 end`}),end:this.db.delete(operationConditionGuard).where(eq(operationConditionGuard.id,id))};}
  async components(id:string,components:ProductPackageComponentInput[]) {
    const existing=await this.db.select().from(productPackageComponent).where(eq(productPackageComponent.packageProductId,id));
    const keep=components.map(row=>row.componentVariantId);
    return [this.db.delete(productPackageComponent).where(and(eq(productPackageComponent.packageProductId,id),keep.length?sql`not ${inJsonArray(productPackageComponent.componentVariantId,keep)}`:sql`1=1`)),
      ...components.map(row=>existing.some(previous=>previous.componentVariantId===row.componentVariantId)?this.db.update(productPackageComponent).set({quantity:row.quantity}).where(and(eq(productPackageComponent.packageProductId,id),eq(productPackageComponent.componentVariantId,row.componentVariantId))):this.db.insert(productPackageComponent).values({...row,packageProductId:id}))];
  }
}
