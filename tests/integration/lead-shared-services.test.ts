import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { handleAuthRequest } from "@/lib/auth/auth";
import type { AuthEmailAdapter, AuthEmailMessage } from "@/lib/email/email-adapter";
import { SINGLETON_WORKSPACE_ID } from "@/lib/services/members/singleton-workspace";
import { createCompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
class RecordingEmailAdapter implements AuthEmailAdapter {
  verificationMessages: AuthEmailMessage[] = [];
  async sendVerification(message: AuthEmailMessage) { this.verificationMessages.push(message); }
  async sendPasswordReset() {}
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
import { LeadService } from "@/lib/services/leads/lead-service";
import { LeadSettingsService } from "@/lib/services/leads/lead-settings-service";
import { leadCreateInputSchema, leadListInputSchema, leadListOutputSchema, leadDetailOutputSchema } from "@/lib/services/leads/lead-contract";
import { fieldCreateInputSchema } from "@/lib/services/custom-fields/field-contracts";
import { normalizeLeadPhone } from "@/lib/services/leads/lead-normalization";
async function setup() {
 const actor=await session(`lead-${crypto.randomUUID()}@example.com`);
 await env.DB.prepare("UPDATE singleton_membership SET role='owner' WHERE user_id=?").bind(actor.id).run();
 const services=root(),context=await requireRequestContext(new Headers({cookie:actor.cookie}),services);
 return {actor,services,context,leads:new LeadService(services.db),settings:new LeadSettingsService(services.db)};
}
function interceptBatch(db:AppDatabase,before:()=>Promise<unknown>):AppDatabase {
 return new Proxy(db,{get(target,property){if(property==="batch") return async(statements:Parameters<AppDatabase["batch"]>[0])=>{await before();return target.batch(statements);};const value=Reflect.get(target,property);return typeof value==="function"?value.bind(target):value;}});
}
import { FIELD_TYPES, type FieldValue } from "@/lib/services/custom-fields/field-contracts";
import { FieldConversionService } from "@/lib/services/custom-fields/field-conversion-service";
import { requirePermission } from "@/lib/services/permissions/permission-policy";
import { timelineOutputSchema } from "@/lib/services/activities/activity-contract";
import { parseListState } from "@/lib/listing/list-state";

describe.sequential("lead integration with shared CRM services", () => {
 beforeEach(clearState);
 it("supports all seventeen field types, required draft files, formulas, conditions, sorting and type conversion", async () => {
  const {services,context,actor,leads}=await setup();
  const customer=await services.contacts.create(context,{firstName:"Customer"});
  const fields: Awaited<ReturnType<typeof services.fields.create>>[]=[];
  for(const type of FIELD_TYPES) fields.push(await services.fields.create(context,fieldCreateInputSchema.parse({entity:"lead",type,label:`Lead ${type}`,required:type==="file",showOnFilter:true,options:["select","multiselect"].includes(type)?[{label:"Choice"}]:undefined,config:type==="formula"?{expression:"1+2"}:undefined})));
  expect(fields).toHaveLength(17);
  const get=(type:string)=>fields.find(field=>field.type===type)!;
  const draft=await services.drafts.create(context,{entity:"lead"});
  const file=await services.files.upload(context,{entity:"lead",recordId:draft.id,draftId:draft.id,fieldId:get("file").id},new Request("https://auth.test/upload",{method:"POST",headers:{"x-file-name":"lead.txt","content-type":"application/octet-stream"},body:"Lead bytes"}));
  const values:Record<string,FieldValue>={};
  const scalar:Record<string,FieldValue>={text:"Text",long_text:"Long text",number:23,date:"2026-09-06T00:00:00.000Z",checkbox:true,url:"https://example.com",email:"lead@example.com",phone:"+84901234567",user:actor.id,money:{amountMinor:125,currency:"USD"},multivalue:["one","two"],rating:4,customer:customer.id,file:[file.id]};
  for(const field of fields) if(field.type!=="formula") values[field.key]=field.type==="select"?field.options[0]!.id:field.type==="multiselect"?[field.options[0]!.id]:scalar[field.type]!;
  await expect(leads.create(context,{firstName:"Missing file"})).rejects.toMatchObject({status:400});
  const item=await leads.create(context,{firstName:"All fields",customFields:values},await services.drafts.prepareConsumption(context,"lead",draft.id));
  expect(item.id).toBe(draft.id);
  expect(await services.fields.values(context,{entity:"lead",recordId:item.id})).toEqual({...values,[get("formula").key]:3});
  expect(new TextDecoder().decode(await (await services.files.download(context,file.id)).arrayBuffer())).toBe("Lead bytes");
  const listed=await leads.list(context,leadListInputSchema.parse({sort:`field:${get("number").key}`,criteria:[{key:get("number").key,operator:"gt",value:20}],fields:{[get("select").key]:[get("select").options[0]!.id]}}));
  expect(listed.total).toBe(1);
  expect(await services.fields.coverage(context,get("formula").id)).toEqual({total:1,filled:1});
  const converter=new FieldConversionService(services.db);
  const preview=await converter.preview(context,get("text").id,"long_text",{});
  expect(preview.rejected).toBe(0);expect(preview.token).not.toBeNull();
  await converter.apply(context,get("text").id,preview.token!);
  expect((await services.fields.values(context,{entity:"lead",recordId:item.id}))[get("text").key]).toBe("Text");
  const layout=await services.layouts.get(context,{entity:"lead"});
  expect(layout.fields.find(field=>field.key===get("file").key)).toMatchObject({required:true,visible:true});
  const saved=await services.layouts.update(context,{entity:"lead",revision:layout.revision,fields:layout.fields.map(({key,kind,visible})=>({key,kind,visible})).reverse()});
  expect(saved.fields[0]?.key).toBe(layout.fields.at(-1)?.key);
  expect(parseListState("lead",new URLSearchParams("status=new&source=manual&collaborator="+actor.id))).toBeDefined();
  const view=await services.views.create(context,{entity:"lead",name:"Lead criteria",shared:false,state:{version:1,query:new URLSearchParams({criteria:JSON.stringify([{key:get("number").key,operator:"gt",value:20}])}).toString()}});
  await services.views.setPreferred(context,{entity:"lead",viewId:view.id});
  expect(await env.DB.prepare("SELECT view_id FROM saved_view_default WHERE user_id=? AND entity='lead'").bind(actor.id).first()).toEqual({view_id:view.id});
  const reader=await session(`reader-${crypto.randomUUID()}@example.com`);
  const readerContext=await requireRequestContext(new Headers({cookie:reader.cookie}),services);
  expect((await services.files.metadata(readerContext,file.id)).id).toBe(file.id);
  await env.DB.prepare("UPDATE module_setting SET enabled=0 WHERE entity='lead'").run();
  expect(new TextDecoder().decode(await (await services.files.download(readerContext,file.id)).arrayBuffer())).toBe("Lead bytes");
  await expect(services.fields.writeValues(context,{entity:"lead",recordId:item.id,values:{[get("text").key]:"Blocked"}})).rejects.toMatchObject({status:403});
  await expect(services.files.upload(context,{entity:"lead",recordId:item.id,fieldId:get("file").id},new Request("https://auth.test/upload",{method:"POST",headers:{"x-file-name":"blocked.txt","content-type":"application/octet-stream"},body:"Blocked"}))).rejects.toMatchObject({status:403});
 });
 it("keeps lead files and task history readable when disabled and rechecks the module during completion", async()=>{
  const {services,context,leads}=await setup();
  const item=await leads.create(context,{firstName:"Task lead"});
  const task=await services.activities.create(context,{type:"task",leadId:item.id,subject:"Follow up",dueAt:"2020-01-01T00:00:00.000Z"});
  expect(task.leadId).toBe(item.id);
  const snapshot=await services.dashboard.summary(context,{scope:"me"});
  expect(snapshot.overdueTasks).toContainEqual(expect.objectContaining({leadId:item.id,lead:{id:item.id,name:"Task lead"}}));
  await services.activities.complete(context,task.id,true);
  expect((await services.activities.timeline(context,{entity:"lead",recordId:item.id,filter:"done",limit:30})).entries).toHaveLength(1);
  await env.DB.prepare("UPDATE module_setting SET enabled=0 WHERE entity='lead'").run();
  expect(timelineOutputSchema.safeParse(await services.activities.timeline(context,{entity:"lead",recordId:item.id,filter:"all",limit:30})).success).toBe(true);
  await expect(services.activities.complete(context,task.id,false)).rejects.toMatchObject({status:403});
  await expect(services.ownership.assign(context,{entity:"lead",ids:[item.id],ownerMembershipId:null})).rejects.toMatchObject({status:403});
 });
 it("cleans lead owners, collaborators and user values during disabled-module member handover without granting export", async()=>{
  const {services,context,leads,actor}=await setup();
  const departing=await session(`departing-${crypto.randomUUID()}@example.com`);
  const memberContext=await requireRequestContext(new Headers({cookie:departing.cookie}),services);
  await expect(requirePermission(services.db,memberContext,["lead.export"])).rejects.toMatchObject({status:403});
  const field=await services.fields.create(context,fieldCreateInputSchema.parse({entity:"lead",type:"user",label:"Assigned helper"}));
  const item=await leads.create(context,{firstName:"Handover",ownerMembershipId:departing.id,collaboratorMembershipIds:[departing.id],customFields:{[field.key]:departing.id}});
  await env.DB.prepare("UPDATE module_setting SET enabled=0 WHERE entity='lead'").run();
  await services.members.remove(context,departing.id,actor.id);
  expect(await leads.byId(context,item.id)).toMatchObject({ownerMembershipId:actor.id,collaboratorMembershipIds:[]});
  expect((await services.fields.values(context,{entity:"lead",recordId:item.id}))[field.key]).toBe(actor.id);
  expect(await env.DB.prepare("SELECT status FROM singleton_membership WHERE user_id=?").bind(departing.id).first()).toEqual({status:"revoked"});
 });
});
