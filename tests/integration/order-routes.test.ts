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
async function setup(){const actor=await session(`order-routes-${crypto.randomUUID()}@example.com`);await env.DB.prepare("UPDATE singleton_membership SET role='owner' WHERE user_id=?").bind(actor.id).run();const services=root(),context=await requireRequestContext(new Headers({cookie:actor.cookie}),services);return {actor,services,context};}

import {createRecordDraftsPostHandler} from "../../src/app/api/crm/record-drafts/route";
import {createGetHandler as listOrders,createPostHandler as createOrder} from "../../src/app/api/crm/orders/route";
import {createGetHandler as getOrder,createPatchHandler as patchOrder} from "../../src/app/api/crm/orders/[orderId]/route";
import {createPostHandler as previewOrder} from "../../src/app/api/crm/orders/preview/route";
import {createGetHandler as commandHistory,createPostHandler as commandOrder} from "../../src/app/api/crm/orders/[orderId]/commands/route";
import {createGetHandler as listPayments,createPostHandler as payOrder} from "../../src/app/api/crm/orders/[orderId]/payments/route";
import {createGetHandler as listInventory} from "../../src/app/api/crm/inventory/route";
import {createGetHandler as getInventory,createPatchHandler as configureInventory,createPostHandler as recordInventory} from "../../src/app/api/crm/inventory/variants/[variantId]/route";
import {createGetHandler as listEntitlements} from "../../src/app/api/crm/entitlements/route";
import {createGetHandler as getEntitlement,createPostHandler as recordEntitlement} from "../../src/app/api/crm/entitlements/[entitlementId]/route";
import {productCreateInputSchema} from "@/lib/services/catalog/product-contract";
function request(path:string,cookie?:string,method="GET",body?:unknown){return new Request("https://auth.test/api/crm/"+path,{method,headers:{...(cookie?{cookie}:{}),origin:"https://auth.test","content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});}
const params=(orderId:string)=>Promise.resolve({orderId});
async function fixture(){const data=await setup();const contact=await data.services.contacts.create(data.context,{firstName:"Order buyer"});const product=await data.services.products.create(data.context,productCreateInputSchema.parse({name:"Order item",kind:"product",initialVariant:{label:"Default",priceMinor:600}}));const detail=await data.services.products.byId(data.context,product!.id);const draft=await successful(await createRecordDraftsPostHandler(data.services)(request("record-drafts",data.actor.cookie,"POST",{entity:"order"})));return {...data,draftId:draft.id as string,input:{name:"HTTP order",contactId:contact.id,lines:[{variantId:detail.variants[0].id,expectedVariantRevision:detail.variants[0].revision,expectedProductRevision:detail.revision,quantity:2}]},calendar:await data.services.settings.get(data.context)};}
it("validates draft order and preview contracts, IDs, authentication and mutation origin",async()=>{
 const {services,actor,input,draftId}=await fixture();const post=createOrder(services);
 expect((await post(request("orders",undefined,"POST",input))).status).toBe(401);
 const unsafe=request("orders",actor.cookie,"POST",input);unsafe.headers.set("origin","https://foreign.invalid");expect((await post(unsafe)).status).toBe(403);
 expect((await post(request("orders",actor.cookie,"POST",{...input,lines:[]}))).status).toBe(400);
 const preview=await successful(await previewOrder(services)(request("orders/preview",actor.cookie,"POST",input)));expect(preview.originalMinor).toBe(1200);
 expect((await post(request("orders",actor.cookie,"POST",input))).status).toBe(400);
 const made=await successful(await post(request("orders",actor.cookie,"POST",{...input,draftId})));
 expect(made.id).toBe(draftId);
 expect(await successful(await post(request("orders",actor.cookie,"POST",{...input,draftId})))).toEqual(made);
 expect((await post(request("orders",actor.cookie,"POST",{...input,name:"Different retry",draftId}))).status).toBe(409);
 expect(await env.DB.prepare("SELECT count(*) AS count FROM sales_order WHERE id=?").bind(draftId).first()).toEqual({count:1});
 const detail=await successful(await getOrder(services,params(made.id))(request("orders",actor.cookie)));expect(detail).toMatchObject({id:made.id,state:"draft",balanceMinor:"1200",originalMinor:1200});
 expect((await successful(await listOrders(services)(request("orders?state=draft",actor.cookie)))).rows.some((row:{id:string})=>row.id===made.id)).toBe(true);
 expect((await getOrder(services,params("invalid"))(request("orders",actor.cookie))).status).toBe(400);
 await successful(await patchOrder(services,params(made.id))(request("orders",actor.cookie,"PATCH",{action:"update",data:{expectedRevision:0,name:"Renamed draft"}})));
 expect((await patchOrder(services,params(made.id))(request("orders",actor.cookie,"PATCH",{action:"update",data:{expectedRevision:0,name:"Stale"}}))).status).toBe(409);
});
it("preserves negative balances and idempotent cash history through fulfillment and cancellation",async()=>{
 const {services,actor,input,calendar,draftId}=await fixture();const made=await successful(await createOrder(services)(request("orders",actor.cookie,"POST",{...input,draftId})));
 const command=(data:unknown)=>commandOrder(services,params(made.id))(request("orders/commands",actor.cookie,"POST",data));
 const confirmed=await successful(await command({action:"confirm",operationKey:crypto.randomUUID(),expectedRevision:0,calendarRevision:calendar.revision}));
 const payment={kind:"collection",amountMinor:2000,method:"cash",operationKey:crypto.randomUUID(),expectedRevision:confirmed.revision,calendarRevision:calendar.revision};
 const pay=(data:unknown)=>payOrder(services,params(made.id))(request("orders/payments",actor.cookie,"POST",data));
 const collected=await successful(await pay(payment));expect(collected.balanceMinor).toBe("-800");
 expect(await successful(await pay(payment))).toEqual(collected);
 expect((await pay({...payment,amountMinor:2001})).status).toBe(409);
 const complete=await successful(await command({action:"complete",operationKey:crypto.randomUUID(),expectedRevision:collected.revision,calendarRevision:calendar.revision}));expect(complete.balanceMinor).toBe("-800");
 const cancelled=await successful(await command({action:"cancel",operationKey:crypto.randomUUID(),expectedRevision:complete.revision,calendarRevision:calendar.revision,reason:"Customer cancelled"}));expect(cancelled.balanceMinor).toBe("-2000");
 const refund=await successful(await pay({kind:"refund",amountMinor:2000,method:"cash",operationKey:crypto.randomUUID(),expectedRevision:cancelled.revision,calendarRevision:calendar.revision}));expect(refund.balanceMinor).toBe("0");
 expect((await successful(await listPayments(services,params(made.id))(request("orders/payments",actor.cookie)))).rows).toHaveLength(2);
 expect((await commandHistory(services,params(made.id))(request("orders/commands",actor.cookie))).status).toBe(200);
 await env.DB.prepare("UPDATE module_setting SET enabled=0 WHERE entity='order'").run();try{expect(await successful(await pay(payment))).toEqual(collected);expect((await pay({...payment,operationKey:crypto.randomUUID(),expectedRevision:refund.revision})).status).toBe(403);}finally{await env.DB.prepare("UPDATE module_setting SET enabled=1 WHERE entity='order'").run();}
});
it("rejects invalid business dates and ungranted financial operations without ledger writes",async()=>{
 const {services,actor,input,calendar,draftId}=await fixture();const made=await successful(await createOrder(services)(request("orders",actor.cookie,"POST",{...input,draftId})));
 const command=(data:unknown)=>commandOrder(services,params(made.id))(request("orders/commands",actor.cookie,"POST",data));
 expect((await command({action:"confirm",operationKey:"invalid",expectedRevision:0,calendarRevision:calendar.revision})).status).toBe(400);
 expect((await command({action:"confirm",operationKey:crypto.randomUUID(),expectedRevision:0,calendarRevision:calendar.revision,businessDate:"2026-02-30"})).status).toBe(400);
 expect((await command({action:"confirm",operationKey:crypto.randomUUID(),expectedRevision:0,calendarRevision:calendar.revision+1})).status).toBe(409);
 await successful(await command({action:"confirm",operationKey:crypto.randomUUID(),expectedRevision:0,calendarRevision:calendar.revision}));
 await env.DB.prepare("UPDATE singleton_membership SET role='member' WHERE user_id=?").bind(actor.id).run();
 expect((await payOrder(services,params(made.id))(request("orders/payments",actor.cookie,"POST",{kind:"collection",amountMinor:100,method:"cash",operationKey:crypto.randomUUID(),expectedRevision:1,calendarRevision:calendar.revision}))).status).toBe(403);
 expect((await successful(await listPayments(services,params(made.id))(request("orders/payments",actor.cookie)))).rows).toEqual([]);
});
it("records real inventory and entitlement movements with bounded replay-safe histories",async()=>{
 const {services,actor,context,input,calendar,draftId}=await fixture();const stockId=input.lines[0].variantId;
 const stockParams=Promise.resolve({variantId:stockId});
 const config=await successful(await configureInventory(services,stockParams)(request("inventory",actor.cookie,"PATCH",{expectedRevision:0,stockTracked:true,sessionUnits:0,expiryDays:null})));
 const receipt={kind:"receipt",quantity:10,reason:"Opening count",operationKey:crypto.randomUUID(),expectedRevision:config.revision,calendarRevision:calendar.revision};
 const receive=()=>recordInventory(services,stockParams)(request("inventory",actor.cookie,"POST",receipt));
 const received=await successful(await receive());expect(received.onHand).toBe(10);expect(await successful(await receive())).toEqual(received);
 const service=await services.products.create(context,productCreateInputSchema.parse({name:"Session product",kind:"service",initialVariant:{label:"Three uses",priceMinor:300}}));
 let serviceDetail=await services.products.byId(context,service!.id);const serviceVariant=serviceDetail.variants[0].id;
 await successful(await configureInventory(services,Promise.resolve({variantId:serviceVariant}))(request("inventory",actor.cookie,"PATCH",{expectedRevision:0,stockTracked:false,sessionUnits:3,expiryDays:null})));
 serviceDetail=await services.products.byId(context,service!.id);
 const stockDetail=await services.products.byId(context,(await successful(await listInventory(services)(request("inventory",actor.cookie)))).rows.find((row:{variantId:string})=>row.variantId===stockId).productId);
 const made=await successful(await createOrder(services)(request("orders",actor.cookie,"POST",{...input,draftId,lines:[{...input.lines[0],expectedProductRevision:stockDetail.revision,expectedVariantRevision:stockDetail.variants.find(row=>row.id===stockId)!.revision},{variantId:serviceVariant,expectedProductRevision:serviceDetail.revision,expectedVariantRevision:serviceDetail.variants[0].revision,quantity:1}]})));
 const command=(action:string,expectedRevision:number)=>commandOrder(services,params(made.id))(request("orders/commands",actor.cookie,"POST",{action,operationKey:crypto.randomUUID(),expectedRevision,calendarRevision:calendar.revision}));
 const confirmed=await successful(await command("confirm",0));await successful(await command("complete",confirmed.revision));
 const inventory=await successful(await listInventory(services)(request("inventory",actor.cookie)));expect(inventory.rows.find((row:{variantId:string})=>row.variantId===stockId).onHand).toBe(8);expect(await successful(await receive())).toEqual(received);
 expect((await successful(await getInventory(services,stockParams)(request("inventory",actor.cookie)))).onHand).toBe(8);
 expect((await inventoryHistory(services,stockParams)(request("inventory",actor.cookie))).status).toBe(200);
 const granted=await successful(await listEntitlements(services)(request(`entitlements?orderId=${made.id}`,actor.cookie)));expect(granted.rows).toHaveLength(1);expect(granted.rows[0]).toMatchObject({granted:3,remaining:3});
 const entitlement=granted.rows[0],entitlementParams=Promise.resolve({entitlementId:entitlement.id});
 const use={kind:"use",quantity:2,reason:"Session completed",operationKey:crypto.randomUUID(),expectedRevision:entitlement.revision,calendarRevision:calendar.revision};
 const record=(data:unknown)=>recordEntitlement(services,entitlementParams)(request("entitlements",actor.cookie,"POST",data));
 const used=await successful(await record(use));expect(used.remaining).toBe(1);expect(await successful(await record(use))).toEqual(used);
 const restored=await successful(await record({...use,kind:"restore",quantity:1,operationKey:crypto.randomUUID(),expectedRevision:used.revision,reason:"Usage correction"}));expect(restored.remaining).toBe(2);expect(await successful(await record(use))).toEqual(used);
 expect((await successful(await getEntitlement(services,entitlementParams)(request("entitlements",actor.cookie)))).remaining).toBe(2);
 expect((await entitlementHistory(services,entitlementParams)(request("entitlements",actor.cookie))).status).toBe(200);
 expect((await record({...use,operationKey:crypto.randomUUID(),expectedRevision:restored.revision,quantity:3})).status).toBe(409);
 await env.DB.prepare("UPDATE module_setting SET enabled=0 WHERE entity IN ('order','product')").run();
 try{
  expect(await successful(await record(use))).toEqual(used);expect(await successful(await receive())).toEqual(received);
  expect((await record({...use,operationKey:crypto.randomUUID(),expectedRevision:restored.revision,quantity:1})).status).toBe(403);
  expect((await recordInventory(services,stockParams)(request("inventory",actor.cookie,"POST",{...receipt,operationKey:crypto.randomUUID()}))).status).toBe(403);
 }finally{await env.DB.prepare("UPDATE module_setting SET enabled=1 WHERE entity IN ('order','product')").run();}
});

import {createGetHandler as inventoryHistory} from "../../src/app/api/crm/inventory/variants/[variantId]/history/route";
import {createGetHandler as entitlementHistory} from "../../src/app/api/crm/entitlements/[entitlementId]/history/route";
