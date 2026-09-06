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
function request(path: string, cookie?: string, method = "GET", body?: unknown) {
  const headers = new Headers({ "cf-ray": "activities-request" });
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    headers.set("origin", "https://auth.test");
    headers.set("sec-fetch-site", "same-origin");
  }
  return new Request(`https://auth.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
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
    ...["activity_visibility", "activity", "custom_field_value", "custom_field_option", "custom_field_definition", "saved_view", "deal_contact", "deal", "contact", "company", "session", "account", "verification", "rate_limit"].map(table => env.DB.prepare(`DELETE FROM ${table}`)),
    env.DB.prepare("INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('sentinel-owner', 'Sentinel Owner', 'sentinel-owner@example.com', 1, 0, 0)"),
    env.DB.prepare("INSERT OR IGNORE INTO singleton_membership (user_id, role, status, created_at, updated_at) VALUES ('sentinel-owner', 'owner', 'active', 0, 0)"),
    env.DB.prepare("UPDATE singleton_membership SET role = 'owner', status = 'active' WHERE user_id = 'sentinel-owner'"),
    env.DB.prepare("UPDATE singleton_membership SET role = 'member' WHERE user_id != 'sentinel-owner' AND role = 'owner'"),
    env.DB.prepare("DELETE FROM singleton_membership WHERE user_id != 'sentinel-owner'"),
    env.DB.prepare("UPDATE singleton_workspace SET owner_user_id = 'sentinel-owner' WHERE id = ?").bind(SINGLETON_WORKSPACE_ID),
    env.DB.prepare("DELETE FROM user WHERE id != 'sentinel-owner'"),
  ]);
}

import { createSavedViewsGetHandler, createSavedViewsPostHandler } from "../../src/app/api/crm/saved-views/route";
import { createSavedViewPatchHandler, createSavedViewDeleteHandler } from "../../src/app/api/crm/saved-views/[viewId]/route";
import { createMemberDeleteHandler, createMemberPatchHandler } from "../../src/app/api/crm/members/[memberId]/route";
const create=(cookie:string,input:unknown)=>createSavedViewsPostHandler(root())(request("/api/crm/saved-views",cookie,"POST",input));
const list=(cookie:string,entity="company")=>createSavedViewsGetHandler(root())(request("/api/crm/saved-views?entity="+entity,cookie));
const patch=(cookie:string,id:string,input:unknown)=>createSavedViewPatchHandler(root(),id)(request("/api/crm/saved-views/"+id,cookie,"PATCH",input));
const remove=(cookie:string,id:string)=>createSavedViewDeleteHandler(root(),id)(request("/api/crm/saved-views/"+id,cookie,"DELETE",{}));
describe.sequential("saved view API ownership",()=>{
  beforeEach(clearState);
  it("does not transfer creator privacy on member removal and restores creator control on reactivation",async()=>{
    const owner=await session("removing-owner@example.com"),creator=await session("removed-creator@example.com"),replacement=await session("replacement@example.com");
    await env.DB.prepare("UPDATE singleton_membership SET role='owner' WHERE user_id=?").bind(owner.id).run();
    const privateView=await successful(await create(creator.cookie,{entity:"company",name:"Private retained",state:{version:1,query:""}}));
    const sharedView=await successful(await create(creator.cookie,{entity:"company",name:"Shared retained",shared:true,state:{version:1,query:""}}));
    await expect(env.DB.prepare("UPDATE saved_view SET creator_user_id=? WHERE id=?").bind(replacement.id,sharedView.id).run()).rejects.toThrow(/saved_view_creator_immutable/);
    await successful(await createMemberDeleteHandler(root(),Promise.resolve({memberId:creator.id}))(request("/api/crm/members/"+creator.id,owner.cookie,"DELETE",{replacementMembershipId:replacement.id})));
    const visible=await successful(await list(replacement.cookie));
    expect(visible.map((v:any)=>v.id)).toEqual([sharedView.id]);
    expect(visible[0].mine).toBe(false);
    expect((await patch(replacement.cookie,sharedView.id,{shared:false})).status).toBe(404);
    expect((await remove(replacement.cookie,privateView.id)).status).toBe(404);
    expect(await env.DB.prepare("SELECT owner_membership_id,creator_user_id FROM saved_view WHERE id=?").bind(privateView.id).first()).toEqual({owner_membership_id:null,creator_user_id:creator.id});
    await successful(await createMemberPatchHandler(root(),Promise.resolve({memberId:creator.id}))(request("/api/crm/members/"+creator.id,owner.cookie,"PATCH",{action:"restore"})));
    const signed=await handleAuthRequest(request("/api/auth/sign-in/email",undefined,"POST",{email:"removed-creator@example.com",password:"correct horse battery staple"}),root().auth,root().db,bindings.AUTH_BASE_URL);
    const cookie=signed.headers.get("set-cookie")?.split(";",1)[0];
    expect(signed.status).toBe(200);expect(cookie).toBeTruthy();
    const regained=await successful(await list(cookie!));
    expect(regained.filter((v:any)=>v.mine).map((v:any)=>v.id).sort()).toEqual([privateView.id,sharedView.id].sort());
    await successful(await patch(cookie!,privateView.id,{name:"Creator regained"}));
    await successful(await remove(cookie!,sharedView.id));
  });
  it("lets active members create private or shared views but only their creator mutate them",async()=>{
    const author=await session("author@example.com"), reader=await session("reader@example.com");
    const own=await successful(await create(author.cookie,{entity:"company",name:"Private",state:{version:1,query:"q=Private"}}));
    expect((await create(author.cookie,{entity:"company",name:"Private",state:{version:1,query:""}})).status).toBe(409);
    const shared=await successful(await create(author.cookie,{entity:"company",name:"Shared",shared:true,state:{version:1,query:"q=Shared"}}));
    const readers=await successful(await create(reader.cookie,{entity:"company",name:"Reader shared",shared:true,state:{version:1,query:""}}));
    expect((await successful(await list(author.cookie))).map((v:any)=>v.id).sort()).toEqual([own.id,shared.id,readers.id].sort());
    const visible=await successful(await list(reader.cookie));
    expect(visible.map((v:any)=>v.id).sort()).toEqual([shared.id,readers.id].sort());
    expect(visible.find((v:any)=>v.id===shared.id).mine).toBe(false);
    expect(visible.find((v:any)=>v.id===readers.id).mine).toBe(true);
    for(const id of [own.id,shared.id]) {
      expect((await patch(reader.cookie,id,{name:"Hijack"})).status).toBe(404);
      expect((await patch(reader.cookie,id,{shared:false})).status).toBe(404);
      expect((await remove(reader.cookie,id)).status).toBe(404);
    }
    await successful(await patch(author.cookie,shared.id,{shared:false,name:"Unshared"}));
    expect((await successful(await list(reader.cookie))).map((v:any)=>v.id)).toEqual([readers.id]);
    await successful(await remove(author.cookie,shared.id));
    expect((await patch(author.cookie,shared.id,{name:"Gone"})).status).toBe(404);
    expect((await successful(await list(author.cookie))).map((v:any)=>v.id)).not.toContain(shared.id);
  });
  it("round trips entity-safe URL state and rejects ephemeral, unknown, and wrong entity contracts",async()=>{
    const actor=await session("state@example.com");
    for(const entity of ["company","contact","deal"]) {
      const query=new URLSearchParams({q:"A & B",sort:"name",dir:"desc",archived:"true",columns:"name,field:category",fields:JSON.stringify({category:["one","two"]})}).toString();
      // Entity built-in names differ; preserve a shared custom column only.
      const params=new URLSearchParams(query);params.set("columns","field:category");params.delete("sort");
      const saved=await successful(await create(actor.cookie,{entity,name:entity,state:{version:1,query:params.toString()}}));
      const reloaded=(await successful(await list(actor.cookie,entity))).find((v:any)=>v.id===saved.id);
      expect(reloaded.state).toEqual(saved.state);
      expect(new URLSearchParams(saved.state.query).get("fields")).toBe(JSON.stringify({category:["one","two"]}));
    }
    for(const query of ["page=2","recordId=x","recordType=company","tab=fields","view=x","unknown=x","sort=unknown","stage=demo-booked","columns=email","fields="+encodeURIComponent('{"bad-key":["x"]}')]) expect((await create(actor.cookie,{entity:"company",name:"Invalid",state:{version:1,query}})).status,query).toBe(400);
    expect((await create(actor.cookie,{entity:"company",name:"Invalid",state:{version:2,query:""}})).status).toBe(400);
    const saved=await successful(await create(actor.cookie,{entity:"company",name:"Fixed entity",state:{version:1,query:""}}));
    expect((await patch(actor.cookie,saved.id,{entity:"contact"})).status).toBe(400);
    expect((await patch(actor.cookie,saved.id,{state:{version:1,query:"stage=demo-booked"}})).status).toBe(400);
  });
  it("fails closed on corrupt stored state and revoked or missing sessions",async()=>{
    const actor=await session("corrupt@example.com");
    const saved=await successful(await create(actor.cookie,{entity:"company",name:"Corrupt",state:{version:1,query:""}}));
    for(const state of ['{"version":99,"query":""}','{"version":1,"query":"page=2"}','{"unexpected":true}']) {
      await env.DB.prepare("UPDATE saved_view SET state_json=? WHERE id=?").bind(state,saved.id).run();
      expect((await list(actor.cookie)).status).toBe(409);
    }
    await expect(env.DB.prepare("UPDATE saved_view SET state_json=? WHERE id=?").bind("not JSON",saved.id).run()).rejects.toThrow(/CHECK constraint/);
    await env.DB.prepare("UPDATE saved_view SET state_json=? WHERE id=?").bind('{"version":1,"query":""}',saved.id).run();
    expect((await createSavedViewsGetHandler(root())(request("/api/crm/saved-views?entity=company"))).status).toBe(401);
    await env.DB.prepare("UPDATE saved_view SET owner_membership_id=NULL WHERE id=?").bind(saved.id).run();
    await env.DB.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id=?").bind(actor.id).run();
    expect((await list(actor.cookie)).status).toBe(403);
    expect((await patch(actor.cookie,saved.id,{name:"Denied"})).status).toBe(403);
    expect((await remove(actor.cookie,saved.id)).status).toBe(403);
  });
});
