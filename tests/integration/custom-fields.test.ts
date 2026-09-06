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

import { FIELD_TYPES } from "@/lib/services/custom-fields/field-contracts";
import { and } from "drizzle-orm";
import { company as companyTable } from "@/lib/db/schema";
import { fieldFilterConditions } from "@/lib/services/custom-fields/field-list-query";
import { createFieldsGetHandler, createFieldsPostHandler, createFieldsPatchHandler } from "../../src/app/api/crm/fields/route";
import { createFieldGetHandler, createFieldPatchHandler, createFieldDeleteHandler } from "../../src/app/api/crm/fields/[fieldId]/route";
import { createFieldValuesGetHandler, createFieldValuesPatchHandler } from "../../src/app/api/crm/fields/values/route";
import { createCompaniesPostHandler, createCompaniesGetHandler } from "../../src/app/api/crm/companies/route";
import { createContactsPostHandler, createContactsGetHandler } from "../../src/app/api/crm/contacts/route";
import { createDealsPostHandler, createDealsGetHandler } from "../../src/app/api/crm/deals/route";
import { createMemberDeleteHandler } from "../../src/app/api/crm/members/[memberId]/route";
const create = (cookie: string, input: unknown) => createFieldsPostHandler(root())(request("/api/crm/fields", cookie, "POST", input));
const patch = (cookie: string, id: string, input: unknown) => createFieldPatchHandler(root(), id)(request("/api/crm/fields/"+id, cookie, "PATCH", input));
const write = (cookie: string, entity: string, recordId: string, values: unknown) => createFieldValuesPatchHandler(root())(request("/api/crm/fields/values", cookie, "PATCH", {entity,recordId,values}));
const read = (cookie: string, entity: string, recordId: string) => createFieldValuesGetHandler(root())(request("/api/crm/fields/values?"+new URLSearchParams({entity,recordId}),cookie));
const remove = (cookie: string,id: string,body: unknown) => createFieldDeleteHandler(root(),id)(request("/api/crm/fields/"+id,cookie,"DELETE",body));
async function record(cookie: string, entity: string, owner: string): Promise<any> {
  if(entity==="company") return successful(await createCompaniesPostHandler(root())(request("/api/crm/companies",cookie,"POST",{name:"Field record"})));
  if(entity==="contact") return successful(await createContactsPostHandler(root())(request("/api/crm/contacts",cookie,"POST",{firstName:"Field record"})));
  const company = await record(cookie,"company",owner);
  return successful(await createDealsPostHandler(root())(request("/api/crm/deals",cookie,"POST",{name:"Field record",companyId:company.id,ownerMembershipId:owner})));
}
describe.sequential("custom field API persistence",()=>{
  beforeEach(clearState);
  it("applies custom filters, row values, totals and facets consistently to all entity APIs",async()=>{
    const actor=await session("entity-filters@example.com");
    for(const entity of ["company","contact","deal"]) {
      const field=await successful(await create(actor.cookie,{entity,label:"Entity category",type:"select",showOnFilter:true,options:[{label:"Included"},{label:"Excluded"}]}));
      const memberField=await successful(await create(actor.cookie,{entity,label:"Display user",type:"user",showOnFilter:false}));
      const included=await record(actor.cookie,entity,actor.id),excluded=await record(actor.cookie,entity,actor.id);
      await successful(await write(actor.cookie,entity,included.id,{[field.key]:field.options[0].id,[memberField.key]:actor.id}));
      await successful(await write(actor.cookie,entity,excluded.id,{[field.key]:field.options[1].id}));
      const handler=entity==="company"?createCompaniesGetHandler:entity==="contact"?createContactsGetHandler:createDealsGetHandler;
      const result=await successful(await handler(root())(request("/api/crm/list?"+new URLSearchParams({fields:JSON.stringify({[field.key]:[field.options[0].id]})}),actor.cookie)));
      expect(result.total).toBe(1);
      expect(result.rows.map((r:any)=>r.id)).toEqual([included.id]);
      expect(result.rows[0].fields[field.key]).toBe(field.options[0].id);
      expect(result.rows[0].fields[memberField.key]).toBe(actor.id);
      expect(result.fieldUserLabels[actor.id]).toBe("entity-filters@example.com");
      expect(result.fieldFacets).not.toHaveProperty(memberField.key);
      expect(result.fieldFacets[field.key]).toEqual(expect.arrayContaining(field.options.map((option:any)=>expect.objectContaining({value:option.id,count:1}))));
    }
  });
  it("filters with AND across fields and OR within values, independent facets and indexed anchors",async()=>{
    const actor=await session("filters@example.com"),other=await session("filter-other@example.com");
    const category=await successful(await create(actor.cookie,{entity:"company",label:"Category",type:"select",showOnFilter:true,showOnTable:true,options:[{label:"A, quoted ' value"},{label:"B"}]}));
    const assignee=await successful(await create(actor.cookie,{entity:"company",label:"Assignee",type:"user",showOnFilter:true}));
    const text=await successful(await create(actor.cookie,{entity:"company",label:"Text",type:"text",showOnFilter:true}));
    const rows=[];
    for(let index=0;index<4;index++) {
      const row=await successful(await createCompaniesPostHandler(root())(request("/api/crm/companies",actor.cookie,"POST",{name:index===3?"Outside":"Match "+index})));
      await env.DB.prepare("UPDATE company SET industry=? WHERE id=?").bind(index===1?"Other":"Tech",row.id).run();
      await successful(await write(actor.cookie,"company",row.id,{category:category.options[index%2].id,assignee:index===2?other.id:actor.id,text:"x"}));
      rows.push(row);
    }
    const query=new URLSearchParams({q:"Match",industry:"Tech",fields:JSON.stringify({category:category.options.map((v:any)=>v.id),assignee:[actor.id]}),pageSize:"1"});
    const result=await successful(await createCompaniesGetHandler(root())(request("/api/crm/companies?"+query,actor.cookie)));
    expect(result.total).toBe(1);
    expect(result.rows.map((r:any)=>r.id)).toEqual([rows[0].id]);
    expect(result.rows[0].fields).toMatchObject({category:category.options[0].id,assignee:actor.id});
    expect(result.customFields.map((f:any)=>f.key)).toContain(category.key);
    expect(result.fieldFacets.category).toEqual(expect.arrayContaining([expect.objectContaining({value:category.options[0].id,count:2}),expect.objectContaining({value:category.options[1].id,count:1})]));
    expect(result.fieldFacets.assignee).toEqual(expect.arrayContaining([expect.objectContaining({value:actor.id,count:2}),expect.objectContaining({value:other.id,count:1})]));
    expect(result.fieldFacets).not.toHaveProperty(text.key);
    for(const fields of [{text:["x"]},{unknown:["x"]},{"bad-key":["x"]},{category:["x'); DROP TABLE company; --"]}]) {
      const response=await createCompaniesGetHandler(root())(request("/api/crm/companies?"+new URLSearchParams({fields:JSON.stringify(fields)}),actor.cookie));
      if("category" in fields) expect((await successful(response)).total).toBe(0); else expect(response.status).toBe(400);
    }
    await env.DB.prepare("UPDATE company SET archived_at=123 WHERE id=?").bind(rows[2].id).run();
    const active=await successful(await createCompaniesGetHandler(root())(request("/api/crm/companies?"+new URLSearchParams({q:"Match"}),actor.cookie)));
    expect(active.total).toBe(2);
    expect(active.fieldFacets.category).toContainEqual(expect.objectContaining({value:category.options[0].id,count:1}));
    const queryPlan=root().db.select({id:companyTable.id}).from(companyTable).where(and(...fieldFilterConditions("company",{category:[category.options[0].id],assignee:[actor.id]}))).toSQL();
    const plan=await env.DB.prepare("EXPLAIN QUERY PLAN "+queryPlan.sql).bind(...queryPlan.params).all<{detail:string}>();
    expect(plan.results.map(r=>r.detail).join(" ")).toMatch(/custom_field_value.*USING (?:COVERING )?INDEX/);
    expect((await env.DB.prepare("PRAGMA index_info(custom_field_value_option_idx)").all<{name:string}>()).results.map(r=>r.name)).toEqual(["field_id","option_id"]);
  });
  it("rolls back unexpected SQL failures and cleans retained hidden user references atomically on removal",async()=>{
    const actor=await session("cleanup-owner@example.com"),target=await session("cleanup-target@example.com");
    await env.DB.prepare("UPDATE singleton_membership SET role='owner' WHERE user_id=?").bind(actor.id).run();
    const row=await record(actor.cookie,"company",actor.id);
    const definitions=[];
    for(const label of ["Active user","Archived user","Deleted user"]) {
      const field=await successful(await create(actor.cookie,{entity:"company",label,type:"user"}));
      await successful(await write(actor.cookie,"company",row.id,{[field.key]:target.id}));
      definitions.push(field);
    }
    await successful(await patch(actor.cookie,definitions[1].id,{action:"archive"}));
    await successful(await remove(actor.cookie,definitions[2].id,{password:"correct horse battery staple",confirmation:definitions[2].key}));
    await env.DB.exec("CREATE TRIGGER reject_field_write BEFORE UPDATE ON custom_field_value BEGIN SELECT RAISE(ABORT, 'unexpected test SQL failure'); END");
    const revoke=()=>createMemberDeleteHandler(root(),Promise.resolve({memberId:target.id}))(request("/api/crm/members/"+target.id,actor.cookie,"DELETE",{replacementMembershipId:actor.id}));
    try {
      expect((await write(actor.cookie,"company",row.id,{[definitions[0].key]:actor.id})).status).toBe(500);
      expect((await revoke()).status).toBe(500);
      expect(await env.DB.prepare("SELECT count(*) AS count FROM custom_field_value WHERE user_membership_id=?").bind(target.id).first()).toEqual({count:3});
      expect(await env.DB.prepare("SELECT status FROM singleton_membership WHERE user_id=?").bind(target.id).first()).toEqual({status:"active"});
      expect(await env.DB.prepare("SELECT count(*) AS count FROM member_operation_guard").first()).toEqual({count:0});
    } finally {await env.DB.exec("DROP TRIGGER reject_field_write");}
    await successful(await revoke());
    expect(await env.DB.prepare("SELECT count(*) AS count FROM custom_field_value WHERE user_membership_id=?").bind(target.id).first()).toEqual({count:0});
    expect(await env.DB.prepare("SELECT count(*) AS count FROM custom_field_value WHERE user_membership_id=?").bind(actor.id).first()).toEqual({count:3});
    await successful(await patch(actor.cookie,definitions[1].id,{action:"restore"}));
    await successful(await patch(actor.cookie,definitions[2].id,{action:"recover"}));
    expect(await successful(await read(actor.cookie,"company",row.id))).toEqual(Object.fromEntries(definitions.map(f=>[f.key,actor.id])));
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
  it("stores all ten types on each entity with decimals, zero, false and explicit clears",async()=>{
    const actor=await session("types@example.com");
    for(const entity of ["company","contact","deal"]) {
      const row=await record(actor.cookie,entity,actor.id);
      for(const type of FIELD_TYPES) {
        const field=await successful(await create(actor.cookie,{entity,label:type,type,options:type==="select"?[{label:"One"},{label:"Two"}]:[]}));
        const values:Record<string,unknown>={text:"  Text  ",long_text:"Long\ntext",number:12.75,date:"2026-09-04",checkbox:false,select:field.options[0]?.id,url:"https://example.com/a",email:"person@example.com",phone:"+84 123",user:actor.id};
        const value=values[type];
        const saved=await successful(await write(actor.cookie,entity,row.id,{[field.key]:value}));
        expect(saved[field.key]).toEqual(type==="date"?"2026-09-04T00:00:00.000Z":type==="text"?"Text":value);
        expect((await successful(await read(actor.cookie,entity,row.id)))[field.key]).toEqual(saved[field.key]);
        if(type==="number") expect((await successful(await write(actor.cookie,entity,row.id,{[field.key]:0})))[field.key]).toBe(0);
        expect(await successful(await createFieldGetHandler(root(),field.id)(request("/api/crm/fields/x?coverage=true",actor.cookie)))).toMatchObject({filled:1});
        await successful(await write(actor.cookie,entity,row.id,{[field.key]:null}));
        expect(await env.DB.prepare("SELECT count(*) AS count FROM custom_field_value WHERE field_id=?").bind(field.id).first()).toEqual({count:0});
      }
    }
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
  it("validates types, options, required values, active members and atomic mixed writes",async()=>{
    const actor=await session("validation@example.com"), inactive=await session("inactive@example.com");
    const row=await record(actor.cookie,"company",actor.id);
    for(const input of [{entity:"task",label:"Bad",type:"text"},{entity:"company",label:"Bad",type:"money"},{entity:"company",label:"Bad",type:"select"},{entity:"company",label:"Bad",type:"text",options:[{label:"No"}]},{entity:"company",label:"Bad",type:"select",options:[{label:"Same"},{label:"same"}]}]) expect((await create(actor.cookie,input)).status).toBe(400);
    const fields:Record<string,any>={};
    for(const type of ["text","number","checkbox","date","email","url","user","select"]) fields[type]=await successful(await create(actor.cookie,{entity:"company",label:type,type,required:type==="text",options:type==="select"?[{label:"First"},{label:"Second"}]:[]}));
    await env.DB.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id=?").bind(inactive.id).run();
    for(const [key,value] of [["text",null],["number","12"],["checkbox",0],["date","2026-02-30"],["email","invalid"],["url","javascript:alert(1)"],["user",inactive.id],["select","foreign-option"],["missing","x"]]) expect((await write(actor.cookie,"company",row.id,{[key as string]:value})).status).toBe(400);
    expect((await write(actor.cookie,"contact",row.id,{text:"x"})).status).toBe(404);
    await successful(await write(actor.cookie,"company",row.id,{text:"before"}));
    expect((await write(actor.cookie,"company",row.id,{text:"after",number:"bad"})).status).toBe(400);
    expect((await successful(await read(actor.cookie,"company",row.id))).text).toBe("before");
    await successful(await patch(actor.cookie,fields.select.id,{action:"update",data:{options:[{id:fields.select.options[1].id,label:fields.select.options[1].label}]}}));
    expect((await write(actor.cookie,"company",row.id,{select:fields.select.options[0].id})).status).toBe(400);
    expect((await createFieldsGetHandler(root())(request("/api/crm/fields?entity=company"))).status).toBe(401);
    expect((await create(inactive.cookie,{entity:"company",label:"Unauthorized",type:"text"})).status).toBe(403);
  });
  it("keeps stable keys and values across rename, archive, password-confirmed tombstone and recovery",async()=>{
    const actor=await session("lifecycle@example.com"),other=await session("other@example.com");
    const row=await record(actor.cookie,"company",actor.id);
    const field=await successful(await create(actor.cookie,{entity:"company",label:"Stable key",type:"number"}));
    await successful(await write(other.cookie,"company",row.id,{[field.key]:0}));
    const renamed=await successful(await patch(other.cookie,field.id,{action:"update",data:{label:"New name"}}));
    expect(renamed.key).toBe(field.key);
    expect((await patch(actor.cookie,field.id,{action:"update",data:{type:"text"}})).status).toBe(409);
    await successful(await patch(actor.cookie,field.id,{action:"archive"}));
    expect(await successful(await read(actor.cookie,"company",row.id))).not.toHaveProperty(field.key);
    expect((await write(actor.cookie,"company",row.id,{[field.key]:2})).status).toBe(400);
    await successful(await patch(other.cookie,field.id,{action:"restore"}));
    expect((await successful(await read(actor.cookie,"company",row.id)))[field.key]).toBe(0);
    for(const body of [{confirmation:field.key},{password:"wrong",confirmation:field.key},{password:"correct horse battery staple",confirmation:"New name"}]) expect((await remove(actor.cookie,field.id,body)).status).toBe(400);
    await successful(await remove(other.cookie,field.id,{password:"correct horse battery staple",confirmation:field.key}));
    expect((await createFieldGetHandler(root(),field.id)(request("/api/crm/fields/x",actor.cookie))).status).toBe(404);
    expect(await successful(await read(actor.cookie,"company",row.id))).not.toHaveProperty(field.key);
    expect((await create(actor.cookie,{entity:"company",label:"Stable key",type:"number"})).status).toBe(409);
    expect(await env.DB.prepare("SELECT number_value FROM custom_field_value WHERE field_id=?").bind(field.id).first()).toEqual({number_value:0});
    await successful(await patch(actor.cookie,field.id,{action:"recover"}));
    expect((await successful(await read(actor.cookie,"company",row.id)))[field.key]).toBe(0);
    const second=await successful(await create(other.cookie,{entity:"company",label:"Second",type:"text"}));
    const reordered=await successful(await createFieldsPatchHandler(root())(request("/api/crm/fields",other.cookie,"PATCH",{entity:"company",ids:[second.id,field.id]})));
    expect(reordered.map((item:any)=>item.id)).toEqual([second.id,field.id]);
    expect((await createFieldsPatchHandler(root())(request("/api/crm/fields",other.cookie,"PATCH",{entity:"company",ids:[field.id]}))).status).toBe(400);
  });
});
