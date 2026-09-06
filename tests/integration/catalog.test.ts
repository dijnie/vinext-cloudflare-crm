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
function intercept(db:AppDatabase,before:()=>Promise<unknown>):AppDatabase{return new Proxy(db,{get(target,key){if(key==="batch")return async(statements:Parameters<AppDatabase["batch"]>[0])=>{await before();return target.batch(statements);};const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;}});}
describe.sequential("catalog records and variants",()=>{
 it("requires real initial pricing and returns searchable default variants with revision guards",async()=>{
  const {products,context}=await setup();expect(productCreateInputSchema.safeParse({name:"Missing",kind:"product"}).success).toBe(false);
  const made=await products.create(context,input("Searchable"," CAT-001 "));const detail=productDetailOutputSchema.parse(await products.byId(context,made!.id));expect(detail).toMatchObject({sku:"CAT-001",priceMinor:12500,costMinor:null,currency:"USD",revision:0});expect(detail.variants).toHaveLength(1);expect(detail.variants[0].isDefault).toBe(true);
  const listed=productListOutputSchema.parse(await products.list(context,productListInputSchema.parse({q:"cat-001"})));expect(listed.rows.map(row=>row.id)).toContain(made!.id);
  await products.update(context,made!.id,{expectedRevision:0,name:"Updated"});await expect(products.update(context,made!.id,{expectedRevision:0,name:"Stale"})).rejects.toMatchObject({status:409});
  const variant=await products.createVariant(context,made!.id,{label:"Large",priceMinor:20000,currency:"EUR",attributes:{size:"L"}});expect((await products.byId(context,made!.id)).revision).toBe(2);
  await products.updateVariant(context,made!.id,variant!.id,productVariantUpdateInputSchema.parse({expectedRevision:0,priceMinor:21000}));expect((await products.byId(context,made!.id)).variants.find(row=>row.id===variant!.id)?.currency).toBe("EUR");await expect(products.updateVariant(context,made!.id,variant!.id,{expectedRevision:0,label:"Stale"})).rejects.toMatchObject({status:409});
  await expect(products.archiveVariant(context,made!.id,detail.variants[0].id,{expectedRevision:0})).rejects.toMatchObject({status:409});
 });
 it("rolls back normalized SKU collisions and safely releases and restores active claims",async()=>{
  const {products,context,services}=await setup();const sku=crypto.randomUUID();const first=await products.create(context,input("SKU original",sku));const before=await env.DB.prepare("SELECT count(*) n FROM product").first();await expect(products.create(context,input("SKU duplicate",` ${sku.toUpperCase()} `))).rejects.toMatchObject({status:409});expect(await env.DB.prepare("SELECT count(*) n FROM product").first()).toEqual(before);
  await products.archive(context,first!.id);const second=await products.create(context,input("SKU claimant",sku));await expect(products.archive(context,first!.id,true)).rejects.toMatchObject({status:409});expect((await products.byId(context,first!.id)).archivedAt).not.toBeNull();await products.archive(context,second!.id);await products.archive(context,first!.id,true);expect((await products.byId(context,first!.id)).archivedAt).toBeNull();
 });
 it("retains archived category references but rejects new choices and stale owner settings",async()=>{
  const {products,categories,context,actor}=await setup();let catalog=await categories.get(context);catalog=await categories.mutate(context,{action:"create",label:"Retained category",revision:catalog.revision});const category=catalog.categories.find(row=>row.label==="Retained category")!;const made=await products.create(context,{...input("Categorized"),categoryId:category.id});catalog=await categories.mutate(context,{action:"archive",id:category.id,revision:catalog.revision});await products.update(context,made!.id,{expectedRevision:0,name:"Retained",categoryId:category.id});await expect(products.create(context,{...input("Rejected category"),categoryId:category.id})).rejects.toMatchObject({status:409});await expect(categories.mutate(context,{action:"relabel",id:category.id,label:"Stale",revision:catalog.revision-1})).rejects.toMatchObject({status:409});
  catalog=await categories.mutate(context,{action:"restore",id:category.id,revision:catalog.revision});catalog=await categories.mutate(context,{action:"relabel",id:category.id,label:"Restored category",revision:catalog.revision});expect((await products.byId(context,made!.id)).categoryLabel).toBe("Restored category");await env.DB.prepare("UPDATE singleton_membership SET role='member' WHERE user_id=?").bind(actor.id).run();await expect(categories.mutate(context,{action:"create",label:"Denied",revision:catalog.revision})).rejects.toMatchObject({status:403});
 });
 it("rejects package cycles and inactive new components while retaining historical composition",async()=>{
  const {products,context}=await setup();const a=await products.create(context,input("Package A",undefined,"package"));const b=await products.create(context,input("Package B",undefined,"package"));const av=(await products.byId(context,a!.id)).variants[0],bv=(await products.byId(context,b!.id)).variants[0];await products.update(context,a!.id,{expectedRevision:0,packageComponents:[{componentVariantId:bv.id,quantity:2}]});await expect(products.update(context,b!.id,{expectedRevision:0,packageComponents:[{componentVariantId:av.id,quantity:1}]})).rejects.toMatchObject({status:409});expect((await products.byId(context,b!.id)).packageComponents).toEqual([]);
  await products.archive(context,b!.id);await products.update(context,a!.id,{expectedRevision:1,packageComponents:[{componentVariantId:bv.id,quantity:3}]});expect((await products.byId(context,a!.id)).packageComponents[0].quantity).toBe(3);const c=await products.create(context,input("Package C",undefined,"package"));await expect(products.update(context,c!.id,{expectedRevision:0,packageComponents:[{componentVariantId:bv.id,quantity:1}]})).rejects.toMatchObject({status:409});expect((await products.variants(context,{q:"Package B"})).rows).toEqual([]);
 });
 it("keeps required custom values and base metadata atomic across SKU and final module races",async()=>{
  const {products,context,services}=await setup();const field=await services.fields.create(context,fieldCreateInputSchema.parse({entity:"product",type:"text",label:"Required payload",required:true}));try{
  await expect(products.create(context,input("Missing value"))).rejects.toMatchObject({status:400});const made=await products.create(context,{...input("Atomic payload",crypto.randomUUID()),customFields:{[field.key]:"Original"}});const before=await env.DB.prepare("SELECT * FROM product WHERE id=?").bind(made!.id).first();const values=(await env.DB.prepare("SELECT * FROM custom_field_value WHERE product_id=?").bind(made!.id).all()).results;
  const raced=new ProductService(intercept(services.db,()=>env.DB.prepare("UPDATE module_setting SET enabled=0 WHERE entity='product'").run()));await expect(raced.update(context,made!.id,{expectedRevision:0,name:"Partial",customFields:{[field.key]:"Partial"}})).rejects.toMatchObject({status:403});expect(await env.DB.prepare("SELECT * FROM product WHERE id=?").bind(made!.id).first()).toEqual(before);expect((await env.DB.prepare("SELECT * FROM custom_field_value WHERE product_id=?").bind(made!.id).all()).results).toEqual(values);
  }finally{await env.DB.prepare("UPDATE module_setting SET enabled=1 WHERE entity='product'").run();await env.DB.prepare("UPDATE custom_field_definition SET required=0 WHERE id=?").bind(field.id).run();}
 });
 it("commits reserved private images only with the product, variant and custom values",async()=>{
  const {products,context,services,actor}=await setup();const draft=await services.drafts.create(context,{entity:"product"});const fieldId="7dd843dc-6df2-4c33-a8f8-8f45cc0e5762";
  const image=await services.files.upload(context,{entity:"product",recordId:draft.id,draftId:draft.id,fieldId},new Request("https://auth.test/api/crm/files",{method:"POST",headers:{"content-type":"application/octet-stream","x-file-name":"catalog.png"},body:new Uint8Array([137,80,78,71])}));
  expect(await env.DB.prepare("SELECT id FROM product WHERE id=?").bind(draft.id).first()).toBeNull();const sku=crypto.randomUUID();await products.create(context,input("Existing image SKU",sku));const reservation=await services.drafts.prepareConsumption(context,"product",draft.id);
  await expect(products.create(context,{...input("Failed image SKU",sku),customFields:{catalog_images:[image.id]}},reservation)).rejects.toMatchObject({status:409});expect(await env.DB.prepare("SELECT id FROM product WHERE id=?").bind(draft.id).first()).toBeNull();expect(await env.DB.prepare("SELECT consumed_at FROM record_draft WHERE id=?").bind(draft.id).first()).toEqual({consumed_at:null});
  const ready=await services.drafts.prepareConsumption(context,"product",draft.id),replay=await services.drafts.prepareConsumption(context,"product",draft.id);await products.create(context,{...input("Private image product"),customFields:{catalog_images:[image.id]}},ready);await expect(products.create(context,input("Replay"),replay)).rejects.toMatchObject({status:409});expect(await services.fields.values(context,{entity:"product",recordId:draft.id})).toMatchObject({catalog_images:[image.id]});expect(new Uint8Array(await (await services.files.download(context,image.id)).arrayBuffer())).toEqual(new Uint8Array([137,80,78,71]));
 });
 it("rolls back final category, field configuration and membership races",async()=>{
  const {products,categories,context,services,actor}=await setup();let catalog=await categories.get(context);catalog=await categories.mutate(context,{action:"create",label:"Race category",revision:catalog.revision});const category=catalog.categories.find(row=>row.label==="Race category")!;const made=await products.create(context,input("Race baseline"));
  const raced=new ProductService(intercept(services.db,()=>env.DB.prepare("UPDATE product_category SET archived_at=1 WHERE id=?").bind(category.id).run()));await expect(raced.update(context,made!.id,{expectedRevision:0,categoryId:category.id,name:"Partial"})).rejects.toMatchObject({status:409});expect((await products.byId(context,made!.id)).name).toBe("Race baseline");
  const field=await services.fields.create(context,fieldCreateInputSchema.parse({entity:"product",type:"text",label:"Configuration race"}));let batches=0;const changed=new ProductService(intercept(services.db,async()=>{if(++batches===2)await env.DB.prepare("UPDATE custom_field_definition SET required=1 WHERE id=?").bind(field.id).run();}));try{await expect(changed.create(context,input("Partial configuration"))).rejects.toMatchObject({status:409});expect(await env.DB.prepare("SELECT id FROM product WHERE name='Partial configuration'").first()).toBeNull();}finally{await env.DB.prepare("UPDATE custom_field_definition SET required=0 WHERE id=?").bind(field.id).run();}
  const revoked=new ProductService(intercept(services.db,()=>env.DB.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id=?").bind(actor.id).run()));await expect(revoked.update(context,made!.id,{expectedRevision:0,name:"Forbidden"})).rejects.toMatchObject({status:403});expect(await env.DB.prepare("SELECT name FROM product WHERE id=?").bind(made!.id).first()).toEqual({name:"Race baseline"});
 });

 it("sorts custom fields and serializes competing category changes",async()=>{
  const {products,categories,context,services}=await setup();const field=await services.fields.create(context,fieldCreateInputSchema.parse({entity:"product",type:"number",label:"Catalog order"}));const low=await products.create(context,{...input("Custom sort low"),customFields:{[field.key]:2}}),high=await products.create(context,{...input("Custom sort high"),customFields:{[field.key]:10}});const listed=productListOutputSchema.parse(await products.list(context,productListInputSchema.parse({q:"Custom sort",sort:`field:${field.key}`,dir:"desc"})));expect(listed.rows.map(row=>row.id)).toEqual([high!.id,low!.id]);
  let catalog=await categories.get(context);catalog=await categories.mutate(context,{action:"create",label:"Concurrent category",revision:catalog.revision});const id=catalog.categories.find(row=>row.label==="Concurrent category")!.id;const outcomes=await Promise.allSettled([categories.mutate(context,{action:"relabel",id,label:"First writer",revision:catalog.revision}),categories.mutate(context,{action:"relabel",id,label:"Second writer",revision:catalog.revision})]);expect(outcomes.filter(row=>row.status==="fulfilled")).toHaveLength(1);expect(outcomes.find(row=>row.status==="rejected")).toMatchObject({reason:{status:409}});catalog=await categories.get(context);catalog=await categories.mutate(context,{action:"reorder",id,beforeId:catalog.categories[0].id===id?null:catalog.categories[0].id,revision:catalog.revision});expect(new Set(catalog.categories.map(row=>row.position)).size).toBe(catalog.categories.length);
 });

});
