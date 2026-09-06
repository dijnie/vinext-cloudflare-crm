import {and,asc,desc,eq,getTableColumns,isNull,isNotNull,like,sql,type SQL} from "drizzle-orm";
import type {AppDatabase} from "@/lib/db/database";
import {salesOrder,contact,user} from "@/lib/db/schema";
import {inJsonArray} from "@/lib/db/sql-filters";
import {fieldConditionQuery} from "../custom-fields/field-condition-query";
import {customFieldSort} from "../custom-fields/field-sort";
import {fieldFilterConditions,fieldListData,validateFieldFilters} from "../custom-fields/field-list-query";
import type {OrderListInput} from "./order-contract";
export class OrderRepository{
 constructor(readonly db:AppDatabase){}
 rows(sort?:SQL.Aliased){return this.db.select({...getTableColumns(salesOrder),contactName:sql<string>`trim(${contact.firstName} || ' ' || coalesce(${contact.lastName},''))`,ownerName:sql<string|null>`${user.name}`.as("owner_name"),ownerEmail:sql<string|null>`${user.email}`.as("owner_email"),...sort?{sortValue:sort}:{}}).from(salesOrder).innerJoin(contact,eq(contact.id,salesOrder.contactId)).leftJoin(user,eq(user.id,salesOrder.ownerMembershipId));}
 async byId(id:string){return this.rows().where(eq(salesOrder.id,id)).get();}
 async list(input:OrderListInput){
 await validateFieldFilters(this.db,"order",input.fields);const extra=await fieldConditionQuery(this.db,"order",input.criteria),sort=await customFieldSort(this.db,"order",input.sort,input.dir);
 const where=and(input.archived?isNotNull(salesOrder.archivedAt):isNull(salesOrder.archivedAt),input.q?like(salesOrder.name,`%${input.q}%`):undefined,input.owner.length?inJsonArray(salesOrder.ownerMembershipId,input.owner):undefined,input.contact.length?inJsonArray(salesOrder.contactId,input.contact):undefined,input.state.length?inJsonArray(salesOrder.state,input.state):undefined,...fieldFilterConditions("order",input.fields),...extra)!;
 const col=input.sort==="name"?salesOrder.name:input.sort==="number"?salesOrder.number:input.sort==="updatedAt"?salesOrder.updatedAt:input.sort==="lastActivityAt"?salesOrder.lastActivityAt:salesOrder.createdAt;
 const [rows,[count],states,owners,contacts]=await this.db.batch([this.rows(sort?.value).where(where).orderBy(...sort?.order??[input.dir==="asc"?asc(col):desc(col)],asc(salesOrder.id)).limit(input.pageSize).offset((input.page-1)*input.pageSize),this.db.select({total:sql<number>`count(*)`}).from(salesOrder).where(where),this.db.select({value:sql<string>`${salesOrder.state}`.as("state_value"),label:sql<string>`${salesOrder.state}`.as("state_label"),count:sql<number>`count(*)`}).from(salesOrder).where(where).groupBy(salesOrder.state),this.db.select({value:sql<string>`coalesce(${salesOrder.ownerMembershipId},'unassigned')`,label:sql<string>`coalesce(${user.name},'common.unassigned')`,count:sql<number>`count(*)`}).from(salesOrder).leftJoin(user,eq(user.id,salesOrder.ownerMembershipId)).where(where).groupBy(salesOrder.ownerMembershipId),this.db.select({value:salesOrder.contactId,label:sql<string>`trim(${contact.firstName} || ' ' || coalesce(${contact.lastName},''))`.as("contact_label"),count:sql<number>`count(*)`}).from(salesOrder).innerJoin(contact,eq(contact.id,salesOrder.contactId)).where(where).groupBy(salesOrder.contactId)]);
 const fields=await fieldListData(this.db,"order",rows.map(r=>r.id),where);return {...fields,rows:rows.map(({sortValue:_s,...r})=>({...r,fields:fields.fieldsByRecord[r.id]??{}})),total:count!.total,facets:{state:states,owner:owners,contact:contacts}};
 }
}
