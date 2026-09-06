import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handleAuthRequest } from "@/lib/auth/auth";
import { createCompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { singletonMembership } from "@/lib/db/schema";
import type { AuthEmailAdapter, AuthEmailMessage } from "@/lib/email/email-adapter";
import { requireRequestContext, type RequestContext } from "@/lib/http/request-context";
import { SINGLETON_WORKSPACE_ID } from "@/lib/services/members/singleton-workspace";
import { sql } from "drizzle-orm";
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
import { customFieldSort } from "@/lib/services/custom-fields/field-sort";
import { fieldFilterConditions } from "@/lib/services/custom-fields/field-list-query";
import { company } from "@/lib/db/schema";
const define = (context: RequestContext, label: string, type: FieldType, extra = {}) => root().fields.create(context, fieldCreateInputSchema.parse({ entity: "company", label, type, ...extra }));
describe.sequential("scalar custom field sorting", () => {
 beforeEach(clearState);
 it("sorts every scalar family with typed ordering, ties and nulls last in both directions", async () => {
  const owner=await actor(), services=root(), other=await actor("member");
  await env.DB.prepare("UPDATE user SET name='Alpha' WHERE id=?").bind(owner.userId).run();
  await env.DB.prepare("UPDATE user SET name='Zulu' WHERE id=?").bind(other.userId).run();
  const alpha=await services.contacts.create(owner.context,{firstName:"Alpha"}), zulu=await services.contacts.create(owner.context,{firstName:"Zulu"});
  const records=await Promise.all(["low","high","tie","missing"].map(name=>services.companies.create(owner.context,{name})));
  const types: FieldType[]=["text","long_text","number","date","checkbox","select","url","email","phone","user","rating","customer","formula"];
  const number=await define(owner.context,"Source","number");
  for (const type of types) {
   const field=await define(owner.context,`Sort ${type}`,type,type==="select"?{options:[{label:"Zulu"},{label:"Alpha"}]}:type==="formula"?{config:{expression:"[source]*2"}}:{});
   const pair: FieldValue[]=type==="number"?[2,10]:type==="rating"?[0,5]:type==="checkbox"?[false,true]:type==="date"?["2025-01-01","2026-01-01"]:type==="user"?[owner.userId,other.userId]:type==="customer"?[alpha.id,zulu.id]:type==="select"?[field.options[1].id,field.options[0].id]:type==="formula"?[0,5]:type==="url"?["https://a.test","https://z.test"]:type==="email"?["a@example.com","z@example.com"]:["Alpha","Zulu"];
   for (const index of [0,1,2]) await services.fields.writeValues(owner.context,{entity:"company",recordId:records[index].id,values:{[type==="formula"?number.key:field.key]:pair[index===1?1:0]}});
   if(type==="select") await env.DB.prepare("UPDATE custom_field_option SET archived_at=123 WHERE field_id=?").bind(field.id).run();
   const tied=[records[0].id,records[2].id].sort();
   for(const dir of ["asc","desc"] as const) {
    const result=await services.companies.list(owner.context,companyListInputSchema.parse({sort:`field:${field.key}`,dir}));
    expect(result.rows.map(row=>row.id),type+dir).toEqual(dir==="asc"?[...tied,records[1].id,records[3].id]:[records[1].id,...tied,records[3].id]);
    expect(JSON.stringify(result)).not.toContain("internalFieldSortValue"); expect(JSON.stringify(result)).not.toContain("__crm_field_sort_value");
    const pages=[]; for(let page=1;page<=4;page++) pages.push((await services.companies.list(owner.context,companyListInputSchema.parse({sort:`field:${field.key}`,dir,page,pageSize:1}))).rows[0].id);
    expect(pages).toEqual(result.rows.map(row=>row.id));
   }
  }
  await services.contacts.archive(owner.context,alpha.id);
  expect((await services.companies.list(owner.context,companyListInputSchema.parse({sort:"field:sort_customer",dir:"asc"}))).rows[0].fields.sort_customer).toBe(alpha.id);
 });
 it("applies numeric ordering through all three list APIs without exposing internal SQL fields",async()=>{
  const owner=await actor(), services=root();
  for(const entity of ["company","contact","deal"] as const){
   const field=await define(owner.context,"Numeric","number",{entity});
   const records=[];
   for(const value of [10,2]){
    const record=entity==="company"?await services.companies.create(owner.context,{name:"Company"}):entity==="contact"?await services.contacts.create(owner.context,{firstName:"Contact"}):await services.deals.create(owner.context,dealCreateInputSchema.parse({name:"Deal",companyId:(await services.companies.create(owner.context,{name:"Deal company"})).id,ownerMembershipId:owner.userId}));
    records.push(record.id); await services.fields.writeValues(owner.context,{entity,recordId:record.id,values:{[field.key]:value}});
   }
   const handler=entity==="company"?createCompaniesGetHandler(services):entity==="contact"?createContactsGetHandler(services):createDealsGetHandler(services);
   const response=await handler(new Request(`https://auth.test/api/crm/${entity}?sort=field:numeric&dir=asc`,{headers:owner.headers}));
   expect(response.status).toBe(200); const body=await response.json() as {rows:{id:string}[]};
   expect(body.rows.map(row=>row.id)).toEqual(records.reverse()); expect(JSON.stringify(body)).not.toMatch(/internalFieldSortValue|__crm_field_sort_value/);
  }
 });
 it("rejects unavailable and non scalar definitions while preserving saved default query state",async()=>{
  const owner=await actor(), services=root(), field=await define(owner.context,"Stored sort","text");
  const query=`sort=field:${field.key}&dir=asc`;
  const view=await services.views.create(owner.context,{entity:"company",name:"Sort view",shared:false,state:{version:1,query}});
  await services.views.setPreferred(owner.context,{entity:"company",viewId:view.id});
  expect(Object.fromEntries(new URLSearchParams((await services.views.preferred(owner.context,"company"))?.state.query))).toEqual({sort:`field:${field.key}`,dir:"asc"});
  await services.fields.archive(owner.context,field.id);
  expect(()=>parseListState("company",new URLSearchParams(query))).not.toThrow();
  for(const key of [field.key,"unknown"]) await expect(services.companies.list(owner.context,companyListInputSchema.parse({sort:`field:${key}`}))).rejects.toMatchObject({status:400});
  for(const type of ["money","multiselect","multivalue"] as const){const unsupported=await define(owner.context,type,type,type==="multiselect"?{options:[{label:"One"}]}:{});await expect(services.companies.list(owner.context,companyListInputSchema.parse({sort:`field:${unsupported.key}`}))).rejects.toMatchObject({status:400});}
  const deleted=await define(owner.context,"Deleted","text"); await services.fields.delete(owner.context,deleted.id,deleted.key);
  await expect(services.companies.list(owner.context,companyListInputSchema.parse({sort:`field:${deleted.key}`}))).rejects.toMatchObject({status:400});
 });
 it("supports expanded formula SQL with twenty categorical filters and preserves AND keys OR choices count and facets",async()=>{
  const owner=await actor(), services=root();
  await define(owner.context,"Source","number");
  let previous="source";
  for(let i=0;i<5;i++){const f=await define(owner.context,`Expanded ${i}`,"formula",{config:{expression:`[${previous}]+[${previous}]`}});previous=f.key;}
  const zeros=(depth:number):string=>depth===0?"0":`(${zeros(depth-1)}+${zeros(depth-1)})`;
  previous=(await define(owner.context,"Maximum","formula",{config:{expression:`--([${previous}]+${zeros(4)})`}})).key;
  const filters:Record<string,string[]>={}, values:Record<string,FieldValue>={source:2};
  for(let i=0;i<20;i++){const f=await define(owner.context,`Choice ${i}`,"select",{showOnFilter:true,options:[{label:"One"},{label:"Two"},{label:"Other"}]});filters[f.key]=f.options.slice(0,2).map(o=>o.id);values[f.key]=f.options[i%2].id;}
  const ids=[];
  for(let i=0;i<3;i++){const r=await services.companies.create(owner.context,{name:"Matched company",ownerMembershipId:owner.userId});ids.push(r.id);await services.fields.writeValues(owner.context,{entity:"company",recordId:r.id,values:{...values,source:i}});}
  await services.fields.writeValues(owner.context,{entity:"company",recordId:ids[2],values:{choice_19:null}});
  const input=companyListInputSchema.parse({sort:`field:${previous}`,dir:"asc",q:"Matched",owner:[owner.userId],fields:filters});
  const result=await services.companies.list(owner.context,input);
  expect(result.total).toBe(2); expect(result.rows.map(r=>r.id)).toEqual(ids.slice(0,2)); expect(result.rows.map(r=>r.fields[previous])).toEqual([0,32]);
  expect(result.fieldFacets.choice_0).toEqual([{value:filters.choice_0[0],label:"One",count:3}]);
  const sort=await customFieldSort(services.db,"company",input.sort,input.dir);
  if(!sort)throw new Error("Missing SQL sort");
  const compiled=services.db.select({value:sort.value}).from(company).where(sql.join(fieldFilterConditions("company",filters),sql` and `)).orderBy(...sort.order).toSQL();
  expect(compiled.params.length).toBeLessThanOrEqual(100);
 });
});
