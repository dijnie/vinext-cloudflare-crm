import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { handleAuthRequest } from "@/lib/auth/auth";
import type { AuthEmailAdapter, AuthEmailMessage } from "@/lib/email/email-adapter";
import { SINGLETON_WORKSPACE_ID } from "@/lib/services/members/singleton-workspace";
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
async function clearState() {
  await env.DB.batch([
    env.DB.prepare("UPDATE module_setting SET enabled=1"),
    ...["activity_visibility", "activity", "custom_field_value", "lead_collaborator", "lead", "custom_field_option", "custom_field_definition", "saved_view", "deal_contact", "deal", "contact", "company", "session", "account", "verification", "rate_limit"].map(table => env.DB.prepare(`DELETE FROM ${table}`)),
    env.DB.prepare("INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('sentinel-owner', 'Sentinel Owner', 'sentinel-owner@example.com', 1, 0, 0)"),
    env.DB.prepare("INSERT OR IGNORE INTO singleton_membership (user_id, role, status, created_at, updated_at) VALUES ('sentinel-owner', 'owner', 'active', 0, 0)"),
    env.DB.prepare("UPDATE singleton_membership SET role = 'owner', status = 'active' WHERE user_id = 'sentinel-owner'"),
    env.DB.prepare("UPDATE singleton_membership SET role = 'member' WHERE user_id != 'sentinel-owner' AND role = 'owner'"),
    env.DB.prepare("DELETE FROM singleton_membership WHERE user_id != 'sentinel-owner'"),
    env.DB.prepare("UPDATE singleton_workspace SET owner_user_id = 'sentinel-owner' WHERE id = ?").bind(SINGLETON_WORKSPACE_ID),
    env.DB.prepare("DELETE FROM user WHERE id != 'sentinel-owner'"),
  ]);
}

import { requireRequestContext } from "@/lib/http/request-context";
import type { AppDatabase } from "@/lib/db/database";
import { fieldCreateInputSchema } from "@/lib/services/custom-fields/field-contracts";
import { createLeadsGetHandler, createLeadsPostHandler } from "@/app/api/crm/leads/route";
import { createLeadGetHandler, createLeadPatchHandler } from "@/app/api/crm/leads/[leadId]/route";
import { createGetHandler as duplicatesHandler } from "@/app/api/crm/leads/duplicates/route";
import { createGetHandler as settingsGet, createPatchHandler as settingsPatch } from "@/app/api/crm/lead-settings/route";
import { createPostHandler as previewHandler } from "@/app/api/crm/leads/[leadId]/conversion-preview/route";
import { createPostHandler as conversionHandler } from "@/app/api/crm/leads/[leadId]/convert/route";
async function setup() {
 const actor=await session(`route-${crypto.randomUUID()}@example.com`);
 await env.DB.prepare("UPDATE singleton_membership SET role='owner' WHERE user_id=?").bind(actor.id).run();
 const services=root(); const context=await requireRequestContext(new Headers({cookie:actor.cookie}),services);
 const request=(path:string,method="GET",body?:unknown)=>new Request(`https://auth.test/api/crm/${path}`,{method,headers:{cookie:actor.cookie,origin:"https://auth.test","content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {actor,services,context,request};
}
describe.sequential("lead HTTP contracts",()=>{
 beforeAll(clearState);
 it("serializes list/detail facets and labels, enforces revisions and rejects invalid identity",async()=>{
  const {services,actor,request}=await setup();
  const created=await successful(await createLeadsPostHandler(services)(request("leads","POST",{firstName:"HTTP lead",email:"http@example.com",collaboratorMembershipIds:[actor.id]})));
  const params=Promise.resolve({leadId:created.id});
  const response=await createLeadGetHandler(services,params)(request(`leads/${created.id}`));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const detail=await successful(response);
  expect(detail).toMatchObject({revision:0,sourceId:"manual",statusId:"new",collaboratorMembershipIds:[actor.id]});
  expect(detail.collaboratorLabels[actor.id]).toBeTruthy();
  expect(detail).not.toHaveProperty("normalizedEmail");
  const listed=await successful(await createLeadsGetHandler(services)(request(`leads?source=manual&status=new&collaborator=${encodeURIComponent(actor.id)}`)));
  expect(listed.total).toBe(1);expect(listed.rows[0].id).toBe(created.id);
  expect(listed.facets.source).toEqual([expect.objectContaining({value:"manual",count:1})]);
  const patch=createLeadPatchHandler(services,params);
  await successful(await patch(request(`leads/${created.id}`,"PATCH",{action:"update",data:{expectedRevision:0,title:"Corrected"}})));
  expect((await patch(request(`leads/${created.id}`,"PATCH",{action:"update",data:{expectedRevision:0,title:"Stale"}}))).status).toBe(409);
  expect((await patch(request(`leads/${created.id}`,"PATCH",{action:"update",data:{title:"Missing revision"}}))).status).toBe(400);
  expect((await createLeadGetHandler(services,Promise.resolve({leadId:"invalid"}))(request("leads/invalid"))).status).toBe(400);
  const duplicates=await successful(await duplicatesHandler(services)(request("leads/duplicates?email=HTTP%40example.com")));
  expect(duplicates.leads).toEqual([expect.objectContaining({id:created.id,reasons:["email"]})]);
 });
 it("keeps shared catalog reads but rejects member settings writes, unsafe origins and revoked sessions",async()=>{
  const {services,actor,request}=await setup();
  const catalog=await successful(await settingsGet(services)(request("lead-settings")));
  await env.DB.prepare("UPDATE singleton_membership SET role='member' WHERE user_id=?").bind(actor.id).run();
  expect((await successful(await settingsGet(services)(request("lead-settings")))).canManage).toBe(false);
  expect((await settingsPatch(services)(request("lead-settings","PATCH",{action:"relabel",kind:"source",id:"manual",label:"Denied",revision:catalog.revision}))).status).toBe(403);
  const hostile=new Request("https://auth.test/api/crm/leads",{method:"POST",headers:{cookie:actor.cookie,origin:"https://other.test","content-type":"application/json"},body:JSON.stringify({firstName:"Denied"})});
  expect((await createLeadsPostHandler(services)(hostile)).status).toBe(403);
  await env.DB.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id=?").bind(actor.id).run();
  expect((await duplicatesHandler(services)(request("leads/duplicates?email=private@example.com"))).status).toBe(403);
  expect((await createLeadsGetHandler(services)(new Request("https://auth.test/api/crm/leads"))).status).toBe(401);
 });
 it("converts by explicit link over HTTP, rejects contact update payload and replays committed result",async()=>{
  const {services,context,request}=await setup();
  const lead=await services.leads.create(context,{firstName:"Lead source"});
  const contact=await services.contacts.create(context,{firstName:"Unchanged contact",email:"linked@example.com"});
  const before=await env.DB.prepare("SELECT * FROM contact WHERE id=?").bind(contact.id).first();
  const params=Promise.resolve({leadId:lead.id});
  const preview=await successful(await previewHandler(services,params)(request(`leads/${lead.id}/conversion-preview`,"POST",{})));
  const body={operationKey:crypto.randomUUID(),expectedLeadRevision:preview.leadRevision,expectedLeadValueRevision:preview.leadValueRevision,expectedMappingRevision:preview.mappingRevision,expectedLeadFieldRevision:preview.leadFieldRevision,expectedContactFieldRevision:preview.contactFieldRevision,target:{mode:"link",contactId:contact.id}};
  const handler=conversionHandler(services,params);
  expect((await handler(request(`leads/${lead.id}/convert`,"POST",{...body,target:{...body.target,contact:{firstName:"Forbidden overwrite"}}}))).status).toBe(400);
  const saved=await successful(await handler(request(`leads/${lead.id}/convert`,"POST",body)));
  expect(saved).toMatchObject({leadId:lead.id,contactId:contact.id,mode:"link"});
  expect(await successful(await handler(request(`leads/${lead.id}/convert`,"POST",body)))).toEqual(saved);
  expect(await env.DB.prepare("SELECT * FROM contact WHERE id=?").bind(contact.id).first()).toEqual(before);
  expect(await successful(await createLeadGetHandler(services,params)(request(`leads/${lead.id}`)))).toMatchObject({statusId:"converted",convertedContactId:contact.id,revision:1});
 });
 it("consumes a lead reservation only with a successful atomic HTTP create",async()=>{
  const {services,context,request}=await setup();
  const field=await services.fields.create(context,fieldCreateInputSchema.parse({entity:"lead",type:"text",label:"Required route field",required:true}));
  const draft=await services.drafts.create(context,{entity:"lead"});
  const handler=createLeadsPostHandler(services);
  expect((await handler(request("leads","POST",{firstName:"Incomplete",draftId:draft.id}))).status).toBe(400);
  expect(await env.DB.prepare("SELECT consumed_at FROM record_draft WHERE id=?").bind(draft.id).first()).toEqual({consumed_at:null});
  expect((await env.DB.prepare("SELECT id FROM lead WHERE id=?").bind(draft.id).all()).results).toEqual([]);
  const payload={firstName:"Atomic reserved lead",draftId:draft.id,customFields:{[field.key]:"Confirmed"}};
  expect(await successful(await handler(request("leads","POST",payload)))).toMatchObject({id:draft.id});
  expect((await handler(request("leads","POST",payload))).status).toBe(409);
  expect((await env.DB.prepare("SELECT id FROM lead WHERE id=?").bind(draft.id).all()).results).toEqual([{id:draft.id}]);
  expect((await env.DB.prepare("SELECT text_value FROM custom_field_value WHERE lead_id=?").bind(draft.id).all()).results).toEqual([{text_value:"Confirmed"}]);
 });

});
