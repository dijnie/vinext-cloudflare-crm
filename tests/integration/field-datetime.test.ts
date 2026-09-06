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
describe.sequential("datetime field storage and calendar revisions",()=>{
 beforeEach(clearState);
 it("toggles date time configuration without rewriting historical values or timestamps",async()=>{
  const owner=await actor(), services=root(), field=await define(owner.context,"Date","date"),record=await services.companies.create(owner.context,{name:"Date"});
  await services.fields.writeValues(owner.context,{entity:"company",recordId:record.id,values:{[field.key]:"2026-09-06T12:34:56.789Z"}});
  const before=await env.DB.prepare("SELECT * FROM custom_field_value WHERE field_id=?").bind(field.id).all();
  for(const dateTime of [true,false,true]){await services.fields.update(owner.context,field.id,{config:{dateTime}});expect((await env.DB.prepare("SELECT * FROM custom_field_value WHERE field_id=?").bind(field.id).all()).results).toEqual(before.results);expect((await services.fields.values(owner.context,{entity:"company",recordId:record.id}))[field.key]).toBe("2026-09-06T12:34:56.789Z");}
 });
 it("rejects datetime config on nondate fields including conversion targets",async()=>{
  const owner=await actor(), services=root();
  for(const dateTime of [true,false]){
   await expect(define(owner.context,"Invalid","number",{config:{dateTime}})).rejects.toMatchObject({status:400});
   const field=await define(owner.context,`Text ${dateTime}`,"text");
   await expect(services.fields.update(owner.context,field.id,{config:{dateTime}})).rejects.toMatchObject({status:400});
   expect(await services.fields.previewConversion(owner.context,field.id,"long_text",{dateTime})).toMatchObject({reasons:["invalid_configuration"]});
  }
 });
 it("requires explicit UTC instants for datetime while preserving legacy date-only writes",async()=>{
  const owner=await actor(), services=root(),field=await define(owner.context,"Date","date",{config:{dateTime:true}}),legacy=await define(owner.context,"Legacy","date"),record=await services.companies.create(owner.context,{name:"Instant"});
  for(const value of ["2026-09-06","2026-09-06T12:00:00.1234Z","2026-09-06T12:00:00+07:00","2026-02-30T00:00:00Z"]) await expect(services.fields.writeValues(owner.context,{entity:"company",recordId:record.id,values:{[field.key]:value}})).rejects.toMatchObject({status:400});
  await services.fields.writeValues(owner.context,{entity:"company",recordId:record.id,values:{[field.key]:"2026-09-06T12:00:00.123Z",[legacy.key]:"2026-09-06"}});
  expect(await services.fields.values(owner.context,{entity:"company",recordId:record.id})).toMatchObject({[field.key]:"2026-09-06T12:00:00.123Z",[legacy.key]:"2026-09-06T00:00:00.000Z"});
 });
 it("returns calendar metadata and atomically rejects stale revisions without partial writes",async()=>{
  const owner=await actor(),services=root(),field=await define(owner.context,"Date","date",{config:{dateTime:true}}),text=await define(owner.context,"Text","text"),record=await services.companies.create(owner.context,{name:"Revision"});
  const metadata=(await services.fields.byId(owner.context,field.id)).calendar;expect(metadata).toBeDefined();if(!metadata)throw new Error("Missing calendar");
  await services.fields.writeValues(owner.context,{entity:"company",recordId:record.id,calendarRevision:metadata.revision,values:{[field.key]:"2026-01-01T00:00:00.001Z",[text.key]:"Original"}});
  await env.DB.prepare("UPDATE crm_setting SET time_zone='America/New_York',calendar_revision=calendar_revision+1 WHERE id='settings'").run();
  expect((await services.fields.byId(owner.context,field.id)).calendar).toEqual({timeZone:"America/New_York",revision:metadata.revision+1});
  const before=(await env.DB.prepare("SELECT * FROM custom_field_value WHERE company_id=? ORDER BY id").bind(record.id).all()).results;
  await expect(services.fields.writeValues(owner.context,{entity:"company",recordId:record.id,calendarRevision:metadata.revision,values:{[field.key]:"2026-01-02T00:00:00Z",[text.key]:"Changed"}})).rejects.toMatchObject({status:409});
  expect((await env.DB.prepare("SELECT * FROM custom_field_value WHERE company_id=? ORDER BY id").bind(record.id).all()).results).toEqual(before);
  await services.fields.writeValues(owner.context,{entity:"company",recordId:record.id,values:{[field.key]:"2026-01-02T00:00:00.123Z"}});
  expect((await services.fields.values(owner.context,{entity:"company",recordId:record.id}))[field.key]).toBe("2026-01-02T00:00:00.123Z");
 });
 it("distinguishes exact millisecond comparisons from retained UTC day conditions",async()=>{
  const owner=await actor(),services=root(),field=await define(owner.context,"Date","date",{config:{dateTime:true}}),ids:string[]=[];
  const values=["2026-09-06T12:00:00.122Z","2026-09-06T12:00:00.123Z","2026-09-06T12:00:00.124Z","2026-09-07T00:00:00.000Z",null];
  for(const value of values){const r=await services.companies.create(owner.context,{name:"Date"});ids.push(r.id);await services.fields.writeValues(owner.context,{entity:"company",recordId:r.id,values:{[field.key]:value}});}
  const expected={eq:[1],neq:[0,2,3],gt:[2,3],gte:[1,2,3],lt:[0],lte:[0,1]};
  for(const operator of ["eq","neq","gt","gte","lt","lte"] as const){const result=await services.companies.list(owner.context,companyListInputSchema.parse({criteria:[{key:field.key,operator,value:values[1]}]}));expect(result.rows.map(r=>r.id).sort(),operator).toEqual(expected[operator].map(i=>ids[i]).sort());}
  expect((await services.companies.list(owner.context,companyListInputSchema.parse({criteria:[{key:field.key,operator:"eq",value:"2026-09-06"}]}))).total).toBe(3);
 });
});
