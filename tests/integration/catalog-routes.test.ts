import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { handleAuthRequest } from "@/lib/auth/auth";
import type { AuthEmailAdapter, AuthEmailMessage } from "@/lib/email/email-adapter";
import { createCompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
class RecordingEmailAdapter implements AuthEmailAdapter {
  verificationMessages: AuthEmailMessage[] = [];
  async sendVerification(message: AuthEmailMessage) { this.verificationMessages.push(message); }
  async sendPasswordReset() { }
}
const bindings = env as RuntimeEnv;
let requestIndex = 50;
const root = () => createCompositionRoot(bindings, new RecordingEmailAdapter());
async function successful(response: Response) {
  const body = await response.json() as any;
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body;
}
async function session(email: string) {
  const adapter = new RecordingEmailAdapter();
  const composition = createCompositionRoot(bindings, adapter);
  const headers = { origin: "https://auth.test", "content-type": "application/json", "cf-connecting-ip": `192.0.2.${++requestIndex}` };
  const auth = (path: string, body: unknown) => handleAuthRequest(new Request(`https://auth.test/api/auth/${path}`, { method: "POST", headers, body: JSON.stringify(body) }), composition.auth, composition.db, bindings.AUTH_BASE_URL);
  const password = "correct horse battery staple";
  await successful(await auth("sign-up/email", { name: email, email, password }));
  const token = new URL(adapter.verificationMessages.at(-1)?.url ?? "").searchParams.get("token");
  if (!token) throw new Error("Expected verification token");
  await composition.auth.api.verifyEmail({ asResponse: true, headers: new Headers({ origin: "https://auth.test" }), query: { token } });
  const signedIn = await auth("sign-in/email", { email, password });
  expect(signedIn.status).toBe(200);
  const cookie = signedIn.headers.get("set-cookie")?.split(";", 1)[0];
  const user = await composition.db.query.user.findFirst({ where: (fields, { eq }) => eq(fields.email, email) });
  if (!cookie || !user) throw new Error("Expected verified session");
  return { cookie, id: user.id };
}
import { requireRequestContext } from "@/lib/http/request-context";
import type { AppDatabase } from "@/lib/db/database";
import { ProductService } from "@/lib/services/catalog/product-service";
import { ProductCategoryService } from "@/lib/services/catalog/product-category-service";
import { productVariantUpdateInputSchema,productCreateInputSchema,productDetailOutputSchema,productListInputSchema,productListOutputSchema } from "@/lib/services/catalog/product-contract";
import { fieldCreateInputSchema } from "@/lib/services/custom-fields/field-contracts";
const input=(name:string,sku?:string,kind="product")=>productCreateInputSchema.parse({name,kind,initialVariant:{label:"Default",priceMinor:12500,sku}});
async function setup(){const actor=await session(`catalog-${crypto.randomUUID()}@example.com`);await env.DB.prepare("UPDATE singleton_membership SET role='owner' WHERE user_id=?").bind(actor.id).run();const services=root(),context=await requireRequestContext(new Headers({cookie:actor.cookie}),services);return {actor,services,context,products:new ProductService(services.db),categories:new ProductCategoryService(services.db)};}

import { createProductsGetHandler, createProductsPostHandler } from "../../src/app/api/crm/products/route";
import { createProductGetHandler, createProductPatchHandler } from "../../src/app/api/crm/products/[productId]/route";
import { createPostHandler as createVariant } from "../../src/app/api/crm/products/[productId]/variants/route";
import { createPatchHandler as patchVariant } from "../../src/app/api/crm/products/[productId]/variants/[variantId]/route";
import { createGetHandler as lookupVariants } from "../../src/app/api/crm/products/variants/route";
import { createGetHandler as categoriesGet, createPatchHandler as categoriesPatch } from "../../src/app/api/crm/product-categories/route";
import { createFilesPostHandler } from "../../src/app/api/crm/files/route";
import { createFieldValuesGetHandler, createFieldValuesPatchHandler } from "../../src/app/api/crm/fields/values/route";
import { FieldConversionService } from "@/lib/services/custom-fields/field-conversion-service";
import { FIELD_TYPES, type FieldValue } from "@/lib/services/custom-fields/field-contracts";
function request(path:string,cookie?:string,method="GET",body?:unknown){return new Request("https://auth.test/api/crm/"+path,{method,headers:{...(cookie?{cookie}:{}),origin:"https://auth.test","content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});}
const params=(id:string)=>Promise.resolve({productId:id});
it("validates product and variant responses while rejecting invalid input and foreign variant IDs",async()=>{
 const {actor,services}=await setup();
 const made=await successful(await createProductsPostHandler(services)(request("products",actor.cookie,"POST",input("Route product"))));
 const detail=await successful(await createProductGetHandler(services,params(made.id))(request("products/"+made.id,actor.cookie)));
 expect(detail).toMatchObject({id:made.id,kind:"product",revision:0,currency:"USD",priceMinor:12500});expect(detail.variants).toHaveLength(1);
 expect((await successful(await createProductsGetHandler(services)(request("products?q=Route",actor.cookie)))).rows[0].id).toBe(made.id);
 const variant=await successful(await createVariant(services,params(made.id))(request("products",actor.cookie,"POST",{label:"EUR option",priceMinor:99,currency:"EUR"})));
 expect((await successful(await patchVariant(services,Promise.resolve({productId:made.id,variantId:variant.id}))(request("products",actor.cookie,"PATCH",{action:"update",data:{expectedRevision:0,label:"Retained currency"}})))).currency).toBe("EUR");
 expect((await lookupVariants(services)(request("products/variants",actor.cookie))).status).toBe(200);
 expect((await patchVariant(services,Promise.resolve({productId:crypto.randomUUID(),variantId:variant.id}))(request("products",actor.cookie,"PATCH",{action:"update",data:{expectedRevision:1,label:"Foreign"}}))).status).toBe(409);
 expect((await createProductGetHandler(services,params("invalid"))(request("products/invalid",actor.cookie))).status).toBe(400);
 expect((await createProductsPostHandler(services)(request("products",actor.cookie,"POST",{...input("Invalid"),initialVariant:{label:"x".repeat(121),priceMinor:1}}))).status).toBe(400);
});
it("rejects unauthenticated, unsafe-origin and missing-permission mutations without partial writes",async()=>{
 const {actor,services}=await setup();const post=createProductsPostHandler(services);
 expect((await post(request("products",undefined,"POST",input("Unauthenticated")))).status).toBe(401);
 const unsafe=request("products",actor.cookie,"POST",input("Unsafe"));unsafe.headers.set("origin","https://foreign.invalid");expect((await post(unsafe)).status).toBe(403);
 await env.DB.prepare("UPDATE singleton_membership SET role='member' WHERE user_id=?").bind(actor.id).run();
 await env.DB.prepare("DELETE FROM access_grant WHERE profile_id='standard-member' AND permission='product.create'").run();
 try{expect((await post(request("products",actor.cookie,"POST",input("Denied")))).status).toBe(403);
 expect((await categoriesPatch(services)(request("product-categories",actor.cookie,"PATCH",{action:"create",label:"Denied",revision:0}))).status).toBe(403);
 expect((await categoriesGet(services)(request("product-categories",actor.cookie))).status).toBe(200);
 expect((await env.DB.prepare("SELECT id FROM product WHERE name IN ('Unauthenticated','Unsafe','Denied')").all()).results).toEqual([]);
 }finally{await env.DB.prepare("INSERT INTO access_grant(profile_id,permission) VALUES('standard-member','product.create')").run();}
});
it("round-trips all seventeen product field types through routes and private draft files",async()=>{
 const {actor,services,context}=await setup();const customer=await services.contacts.create(context,{firstName:"Product customer"});
 const fields:Awaited<ReturnType<typeof services.fields.create>>[]=[];
 for(const type of FIELD_TYPES)fields.push(await services.fields.create(context,fieldCreateInputSchema.parse({entity:"product",type,label:`Route ${type}`,required:type==="file",showOnFilter:true,options:["select","multiselect"].includes(type)?[{label:"Choice"}]:undefined,config:type==="formula"?{expression:"1+2"}:undefined})));
 const get=(type:string)=>fields.find(field=>field.type===type)!;
 try{
 const draft=await services.drafts.create(context,{entity:"product"});
 const upload=new Request(`https://auth.test/api/crm/files?entity=product&recordId=${draft.id}&draftId=${draft.id}&fieldId=${get("file").id}`,{method:"POST",headers:{cookie:actor.cookie,origin:"https://auth.test","content-type":"application/octet-stream","x-file-name":"product.txt"},body:"Private catalog bytes"});
 const file=await successful(await createFilesPostHandler(services)(upload));
 const values:Record<string,FieldValue>={},scalar:Record<string,FieldValue>={text:"Text",long_text:"Long text",number:23,date:"2026-09-06T00:00:00.000Z",checkbox:true,url:"https://example.com",email:"catalog@example.com",phone:"+84901234567",user:actor.id,money:{amountMinor:125,currency:"USD"},multivalue:["one","two"],rating:4,customer:customer.id,file:[file.id]};
 for(const field of fields)if(field.type!=="formula")values[field.key]=field.type==="select"?field.options[0]!.id:field.type==="multiselect"?[field.options[0]!.id]:scalar[field.type]!;
 expect((await createProductsPostHandler(services)(request("products",actor.cookie,"POST",input("Missing required file")))).status).toBe(400);
 const made=await successful(await createProductsPostHandler(services)(request("products",actor.cookie,"POST",{...input("All field routes"),draftId:draft.id,customFields:values})));
 expect(made.id).toBe(draft.id);
 const stored=await successful(await createFieldValuesGetHandler(services)(request(`fields/values?entity=product&recordId=${made.id}`,actor.cookie)));
 expect(stored).toMatchObject({...values,[get("formula").key]:3});expect(fields).toHaveLength(17);
 const list=await successful(await createProductsGetHandler(services)(request("products?q=All+field+routes",actor.cookie)));expect(list.rows[0].fields).toMatchObject({...values,[get("formula").key]:3});expect(list.fieldFileLabels[file.id]).toBe("product.txt");
 expect(new TextDecoder().decode(await (await services.files.download(context,file.id)).arrayBuffer())).toBe("Private catalog bytes");
 expect((await services.layouts.get(context,{entity:"product"})).fields.find(field=>field.key===get("file").key)).toMatchObject({required:true,visible:true});
 expect((await createProductsPostHandler(services)(request("products",actor.cookie,"POST",{...input("Replayed draft"),draftId:draft.id,customFields:values}))).status).toBe(409);
 const layout=await services.layouts.get(context,{entity:"product"});
 const reordered=await services.layouts.update(context,{entity:"product",revision:layout.revision,fields:layout.fields.map(({key,kind,visible})=>({key,kind,visible})).reverse()});expect(reordered.fields[0].key).toBe(layout.fields.at(-1)!.key);
 const converter=new FieldConversionService(services.db),preview=await converter.preview(context,get("text").id,"long_text",{});expect(preview.rejected).toBe(0);await converter.apply(context,get("text").id,preview.token!);
 expect((await services.fields.values(context,{entity:"product",recordId:made.id}))[get("text").key]).toBe("Text");
 const view=await services.views.create(context,{entity:"product",name:"Catalog view",shared:false,state:{version:1,query:"kind=product"}});await services.views.setPreferred(context,{entity:"product",viewId:view.id});
 expect(await env.DB.prepare("SELECT view_id FROM saved_view_default WHERE user_id=? AND entity='product'").bind(actor.id).first()).toEqual({view_id:view.id});

 const task=await services.activities.create(context,{type:"task",productId:made.id,subject:"Catalog task"});
 await env.DB.prepare("UPDATE module_setting SET enabled=0 WHERE entity='product'").run();
 expect((await createProductGetHandler(services,params(made.id))(request("products",actor.cookie))).status).toBe(200);
 expect((await createProductPatchHandler(services,params(made.id))(request("products",actor.cookie,"PATCH",{action:"update",data:{expectedRevision:0,name:"Disabled"}}))).status).toBe(403);
 expect((await createFieldValuesPatchHandler(services)(request("fields/values",actor.cookie,"PATCH",{entity:"product",recordId:made.id,values:{[get("text").key]:"Disabled"}}))).status).toBe(403);
 await expect(services.activities.complete(context,task.id,true)).rejects.toMatchObject({status:403});
 expect(new TextDecoder().decode(await (await services.files.download(context,file.id)).arrayBuffer())).toBe("Private catalog bytes");
 }finally{await env.DB.prepare("UPDATE module_setting SET enabled=1 WHERE entity='product'").run();await env.DB.prepare("UPDATE custom_field_definition SET required=0 WHERE entity='product'").run();}
});

import { OwnershipService } from "@/lib/services/members/ownership-service";
import { createOwnershipPatchHandler } from "../../src/app/api/crm/ownership/route";
it("rolls back bulk assignment when the selected owner is revoked after validation",async()=>{
 const {actor,services,context,products}=await setup();
 const target=await session(`assignment-${crypto.randomUUID()}@example.com`);
 const first=await products.create(context,input("Assignment first")),second=await products.create(context,input("Assignment second"));
 const before=(await env.DB.prepare("SELECT id,owner_membership_id,revision,updated_at FROM product WHERE id IN (?,?) ORDER BY id").bind(first!.id,second!.id).all()).results;
 let intercepted=false;
 const db=new Proxy(services.db,{get(object,key){if(key==="batch")return async(statements:Parameters<AppDatabase["batch"]>[0])=>{intercepted=true;await env.DB.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id=?").bind(target.id).run();return object.batch(statements);};const value=Reflect.get(object,key);return typeof value==="function"?value.bind(object):value;}});
 const response=await createOwnershipPatchHandler({...services,ownership:new OwnershipService(db)})(request("ownership",actor.cookie,"PATCH",{entity:"product",ids:[first!.id,second!.id],ownerMembershipId:target.id}));
 expect(response.status,JSON.stringify(await response.json())).toBe(409);expect(intercepted).toBe(true);
 expect((await env.DB.prepare("SELECT id,owner_membership_id,revision,updated_at FROM product WHERE id IN (?,?) ORDER BY id").bind(first!.id,second!.id).all()).results).toEqual(before);
});
