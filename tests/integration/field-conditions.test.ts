import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handleAuthRequest } from "@/lib/auth/auth";
import { createCompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { singletonMembership } from "@/lib/db/schema";
import type { AuthEmailAdapter, AuthEmailMessage } from "@/lib/email/email-adapter";
import { requireRequestContext, type RequestContext } from "@/lib/http/request-context";
import { SINGLETON_WORKSPACE_ID } from "@/lib/services/members/singleton-workspace";
import { fieldCreateInputSchema, type FieldType, type FieldValue } from "@/lib/services/custom-fields/field-contracts";
import { createCompaniesGetHandler } from "../../src/app/api/crm/companies/route";
import { createContactsGetHandler } from "../../src/app/api/crm/contacts/route";
import { createDealsGetHandler } from "../../src/app/api/crm/deals/route";
import { dealCreateInputSchema } from "@/lib/services/deals/deal-contract";
import { companyListInputSchema } from "@/lib/services/companies/company-contract";

class RecordingEmailAdapter implements AuthEmailAdapter {
  verificationMessages: AuthEmailMessage[] = [];
  async sendVerification(message: AuthEmailMessage) {
    this.verificationMessages.push(message);
  }
  async sendPasswordReset() {}
}

const bindings = env as RuntimeEnv;
const password = "correct horse battery staple";
let requestIndex = 170;

async function clearState() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM activity_visibility"),
    env.DB.prepare("DELETE FROM activity"),
    env.DB.prepare("DELETE FROM custom_field_value"),
    env.DB.prepare("DELETE FROM custom_field_option"),
    env.DB.prepare("DELETE FROM custom_field_definition"),
    env.DB.prepare("DELETE FROM saved_view"),
    env.DB.prepare("DELETE FROM deal_contact"),
    env.DB.prepare("DELETE FROM deal"),
    env.DB.prepare("DELETE FROM contact"),
    env.DB.prepare("DELETE FROM company"),
    env.DB.prepare("DELETE FROM session"),
    env.DB.prepare("DELETE FROM account"),
    env.DB.prepare("DELETE FROM verification"),
    env.DB.prepare("DELETE FROM rate_limit"),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('sentinel-owner', 'Sentinel Owner', 'sentinel-owner@example.com', 1, 0, 0)",
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO singleton_membership (user_id, role, status, created_at, updated_at) VALUES ('sentinel-owner', 'owner', 'active', 0, 0)",
    ),
    env.DB.prepare(
      "UPDATE singleton_membership SET role = 'owner', status = 'active' WHERE user_id = 'sentinel-owner'",
    ),
    env.DB.prepare(
      "UPDATE singleton_membership SET role = 'member' WHERE user_id != 'sentinel-owner' AND role = 'owner'",
    ),
    env.DB.prepare(
      "DELETE FROM singleton_membership WHERE user_id != 'sentinel-owner'",
    ),
    env.DB.prepare(
      "UPDATE singleton_workspace SET owner_user_id = 'sentinel-owner' WHERE id = ?",
    ).bind(SINGLETON_WORKSPACE_ID),
    env.DB.prepare("DELETE FROM user WHERE id != 'sentinel-owner'"),
    env.DB.prepare("DELETE FROM member_branch"),
    env.DB.prepare("UPDATE branch_setting SET default_branch_id='default-branch' WHERE id='settings'"),
    env.DB.prepare("DELETE FROM branch WHERE id!='default-branch'"),
    env.DB.prepare("DELETE FROM access_profile WHERE id!='standard-member'"),
    env.DB.prepare("DELETE FROM action_operation_guard"),
  ]);
}

async function verifiedSession(email: string) {
  const emailAdapter = new RecordingEmailAdapter();
  const root = createCompositionRoot(bindings, emailAdapter);
  requestIndex += 1;
  const headers = {
    origin: "https://auth.test",
    "content-type": "application/json",
    "cf-connecting-ip": `203.0.113.${requestIndex}`,
  };
  const signUp = await handleAuthRequest(
    new Request("https://auth.test/api/auth/sign-up/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: email, email, password }),
    }),
    root.auth,
    root.db,
    bindings.AUTH_BASE_URL,
  );
  expect(signUp.status).toBe(200);
  const token = new URL(
    emailAdapter.verificationMessages.at(-1)?.url ?? "",
  ).searchParams.get("token");
  if (!token) throw new Error("Expected verification token");
  await root.auth.api.verifyEmail({
    asResponse: true,
    headers: new Headers({ origin: "https://auth.test" }),
    query: { token },
  });
  const signIn = await handleAuthRequest(
    new Request("https://auth.test/api/auth/sign-in/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
    }),
    root.auth,
    root.db,
    bindings.AUTH_BASE_URL,
  );
  const cookie = signIn.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Expected session cookie");
  const user = await root.db.query.user.findFirst({
    where: (fields, { eq }) => eq(fields.email, email),
  });
  if (!user) throw new Error("Expected user");
  return { cookie, userId: user.id };
}


const root = () => createCompositionRoot(bindings, new RecordingEmailAdapter());
async function actor(role: "owner" | "member" = "owner") {
  const session = await verifiedSession(`${crypto.randomUUID()}@example.com`);
  const services = root();
  await services.db.update(singletonMembership).set({ role }).where(eq(singletonMembership.userId, session.userId));
  const headers = new Headers({ cookie: session.cookie, origin: "https://auth.test", "content-type": "application/json" });
  return { ...session, headers, context: await requireRequestContext(headers, services) };
}


import { parseListState } from "@/lib/listing/list-state";
import type { FieldCriterion } from "@/lib/services/custom-fields/field-filter-contracts";
const define=(context:RequestContext,label:string,type:FieldType,extra={})=>root().fields.create(context,fieldCreateInputSchema.parse({entity:"company",label,type,showOnFilter:true,...extra}));
const list=(context:RequestContext,criteria:FieldCriterion[],extra={})=>root().companies.list(context,companyListInputSchema.parse({criteria,...extra}));
describe.sequential("typed field conditions on real D1",()=>{
 beforeEach(clearState);
 it("matches literal Unicode text, empty strings and arrays without wildcard or substring expansion",async()=>{
  const owner=await actor(), services=root();
  const text=await define(owner.context,"Text","text"), array=await define(owner.context,"Array","multivalue");
  const records=[];
  for(const [textValue,arrayValue] of [["Việt %_ ' OR 1=1 --",["exact","Việt"]],["Việt anything",["exactly"]],["",[]],[null,null]] as [FieldValue,FieldValue][]){const r=await services.companies.create(owner.context,{name:"Literal"});records.push(r.id);await services.fields.writeValues(owner.context,{entity:"company",recordId:r.id,values:{[text.key]:textValue,[array.key]:arrayValue}});}
  for(const value of ["%_","' OR 1=1 --","Việt %"]) expect((await list(owner.context,[{key:text.key,operator:"contains",value}])).rows.map(r=>r.id)).toEqual([records[0]]);
  expect((await list(owner.context,[{key:array.key,operator:"contains",value:"exact"}])).rows.map(r=>r.id)).toEqual([records[0]]);
  for(const key of [text.key,array.key]){expect((await list(owner.context,[{key,operator:"empty"}])).rows.map(r=>r.id).sort()).toEqual(records.slice(2).sort());expect((await list(owner.context,[{key,operator:"not_empty"}])).total).toBe(2);}
  expect((await list(owner.context,[{key:text.key,operator:"neq",value:"Việt anything"}])).rows.map(r=>r.id)).toEqual([records[0]]);
 });
 it("keeps zero false money zero nonempty and requires currency for every monetary comparison",async()=>{
  const owner=await actor(), services=root();
  const number=await define(owner.context,"Number","number"), checkbox=await define(owner.context,"Boolean","checkbox"), money=await define(owner.context,"Money","money");
  const ids=[];
  for(const value of [{amountMinor:0,currency:"USD"},{amountMinor:10,currency:"USD"},{amountMinor:10,currency:"VND"},null] as FieldValue[]){const r=await services.companies.create(owner.context,{name:"Money"});ids.push(r.id);await services.fields.writeValues(owner.context,{entity:"company",recordId:r.id,values:{[money.key]:value,[number.key]:value===null?null:0,[checkbox.key]:value===null?null:false}});}
  for(const key of [number.key,checkbox.key,money.key]) expect((await list(owner.context,[{key,operator:"empty"}])).rows.map(r=>r.id)).toEqual([ids[3]]);
  const expected={eq:[ids[0]],neq:[ids[1]],gt:[ids[1]],gte:ids.slice(0,2),lt:[],lte:[ids[0]]};
  for(const operator of ["eq","neq","gt","gte","lt","lte"] as const) expect((await list(owner.context,[{key:money.key,operator,value:{amountMinor:0,currency:"USD"}}])).rows.map(r=>r.id).sort(),operator).toEqual(expected[operator].sort());
 });
 it("compares UTC days with midday values negative epochs and exclusive upper boundaries",async()=>{
  const owner=await actor(), services=root(), field=await define(owner.context,"Date","date");
  const times=[-86400001,-86400000,-43200000,-1,0,null];const ids:string[]=[];
  for(const time of times){const r=await services.companies.create(owner.context,{name:"Date"});ids.push(r.id);if(time!==null)await env.DB.prepare("INSERT INTO custom_field_value(id,field_id,company_id,date_value,updated_at) VALUES (?,?,?,?,0)").bind(crypto.randomUUID(),field.id,r.id,time).run();}
  const expected={eq:[1,2,3],neq:[0,4],gt:[4],gte:[1,2,3,4],lt:[0],lte:[0,1,2,3]};
  for(const operator of ["eq","neq","gt","gte","lt","lte"] as const) expect((await list(owner.context,[{key:field.key,operator,value:"1969-12-31"}])).rows.map(r=>r.id).sort(),operator).toEqual(expected[operator].map(i=>ids[i]).sort());
 });
 it("uses historical reference identities and combines criteria AND with categorical OR",async()=>{
  const owner=await actor(), services=root(), customer=await services.contacts.create(owner.context,{firstName:"Reference label"});
  const select=await define(owner.context,"Choice","select",{options:[{label:"Same"},{label:"Same again"}]}), multi=await define(owner.context,"Choices","multiselect",{options:[{label:"One"},{label:"Two"}]}), person=await define(owner.context,"User","user"), reference=await define(owner.context,"Customer","customer"), number=await define(owner.context,"Number","number");
  const ids=[];
  for(let i=0;i<3;i++){const r=await services.companies.create(owner.context,{name:"References"});ids.push(r.id);await services.fields.writeValues(owner.context,{entity:"company",recordId:r.id,values:{[select.key]:select.options[i%2].id,[multi.key]:multi.options.map(o=>o.id),[person.key]:owner.userId,[reference.key]:customer.id,[number.key]:i}});}
  await services.contacts.archive(owner.context,customer.id);await env.DB.prepare("UPDATE custom_field_option SET archived_at=1 WHERE id=?").bind(select.options[0].id).run();
  for(const [key,value] of [[select.key,select.options[0].id],[person.key,owner.userId],[reference.key,customer.id],[multi.key,multi.options[0].id]]) expect((await list(owner.context,[{key,operator:key===multi.key?"contains":"eq",value}])).total).toBe(key===select.key?2:3);
  expect((await list(owner.context,[{key:reference.key,operator:"eq",value:"Reference label"}])).total).toBe(0);
  const result=await list(owner.context,[{key:number.key,operator:"gte",value:1},{key:number.key,operator:"lt",value:2}],{fields:{[select.key]:select.options.map(o=>o.id)}});
  expect(result.total).toBe(1);expect(result.rows.map(r=>r.id)).toEqual([ids[1]]);expect(result.fieldFacets[select.key]).toEqual([{value:select.options[1].id,label:"Same again",count:1}]);
 });
 it("applies conditions to all three API lists totals and facets with formula null semantics",async()=>{
  const owner=await actor(), services=root();
  for(const entity of ["company","contact","deal"] as const){
   const source=await define(owner.context,"Source","number",{entity});await define(owner.context,"Result","formula",{entity,config:{expression:"10/[source]"}});const choice=await define(owner.context,"Choice","select",{entity,options:[{label:"One"}]});
   for(const value of [null,0,2]){const r=entity==="company"?await services.companies.create(owner.context,{name:"Company"}):entity==="contact"?await services.contacts.create(owner.context,{firstName:"Contact"}):await services.deals.create(owner.context,dealCreateInputSchema.parse({name:"Deal",companyId:(await services.companies.create(owner.context,{name:"Deal company"})).id,ownerMembershipId:owner.userId}));await services.fields.writeValues(owner.context,{entity,recordId:r.id,values:{[source.key]:value,[choice.key]:choice.options[0].id}});}
   const handler=entity==="company"?createCompaniesGetHandler(services):entity==="contact"?createContactsGetHandler(services):createDealsGetHandler(services);
   for(const [criterion,total] of [[{key:"result",operator:"empty"},2],[{key:"result",operator:"eq",value:5},1]] as [FieldCriterion,number][]){const response=await handler(new Request(`https://auth.test/api/crm/${entity}?criteria=${encodeURIComponent(JSON.stringify([criterion]))}`,{headers:owner.headers}));expect(response.status).toBe(200);const body=await response.json() as {total:number;rows:unknown[];fieldFacets:Record<string,{count:number}[]>};expect(body.total).toBe(total);expect(body.rows).toHaveLength(total);expect(body.fieldFacets.choice[0].count).toBe(total);}
  }
 });
 it("rejects unavailable type invalid and overly complex conditions while retaining default view structure",async()=>{
  const owner=await actor(), services=root(), source=await define(owner.context,"Source","number");
  const criteria:FieldCriterion[]=[{key:source.key,operator:"gt",value:0}];
  const view=await services.views.create(owner.context,{entity:"company",name:"Typed view",shared:false,state:{version:1,query:new URLSearchParams({criteria:JSON.stringify(criteria)}).toString()}});await services.views.setPreferred(owner.context,{entity:"company",viewId:view.id});
  await services.fields.archive(owner.context,source.id);
  expect(parseListState("company",new URLSearchParams((await services.views.preferred(owner.context,"company"))?.state.query)).list.criteria).toEqual(criteria);
  await expect(list(owner.context,criteria)).rejects.toMatchObject({status:400});await services.fields.restore(owner.context,source.id);
  await expect(list(owner.context,[{key:source.key,operator:"contains",value:"1"}])).rejects.toMatchObject({status:400});
  await services.fields.update(owner.context,source.id,{showOnFilter:false});await expect(list(owner.context,criteria)).rejects.toMatchObject({status:400});
  await expect(list(owner.context,[{key:"unknown",operator:"empty"}])).rejects.toMatchObject({status:400});
  let previous=source.key;for(let i=0;i<5;i++){const f=await define(owner.context,`Expanded ${i}`,"formula",{config:{expression:`[${previous}]+[${previous}]`}});previous=f.key;}
  await expect(list(owner.context,Array(20).fill({key:previous,operator:"eq",value:1}))).rejects.toMatchObject({status:400,code:"validation_failed"});
 });
});
