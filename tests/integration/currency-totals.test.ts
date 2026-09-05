import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { handleAuthRequest } from "@/modules/auth/auth";
import type { AuthEmailAdapter, AuthEmailMessage } from "@/modules/auth/email-adapter";
import { SINGLETON_WORKSPACE_ID } from "@/modules/auth/singleton-workspace";
import { createCompositionRoot, type RuntimeEnv } from "@/server/composition-root";
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
    env.DB.prepare("UPDATE crm_setting SET pending_job_id=NULL,active_conversion_version=\'initial\',reporting_currency=\'USD\',rates_revision=0"),
    ...["currency_job","deal_conversion","exchange_rate","activity_visibility", "activity", "custom_field_value", "custom_field_option", "custom_field_definition", "saved_view", "deal_contact", "deal", "contact", "company", "session", "account", "verification", "rate_limit"].map(table => env.DB.prepare(`DELETE FROM ${table}`)),
    env.DB.prepare("INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('sentinel-owner', 'Sentinel Owner', 'sentinel-owner@example.com', 1, 0, 0)"),
    env.DB.prepare("INSERT OR IGNORE INTO singleton_membership (user_id, role, status, created_at, updated_at) VALUES ('sentinel-owner', 'owner', 'active', 0, 0)"),
    env.DB.prepare("UPDATE singleton_membership SET role = 'owner', status = 'active' WHERE user_id = 'sentinel-owner'"),
    env.DB.prepare("UPDATE singleton_membership SET role = 'member' WHERE user_id != 'sentinel-owner' AND role = 'owner'"),
    env.DB.prepare("DELETE FROM singleton_membership WHERE user_id != 'sentinel-owner'"),
    env.DB.prepare("UPDATE singleton_workspace SET owner_user_id = 'sentinel-owner' WHERE id = ?").bind(SINGLETON_WORKSPACE_ID),
    env.DB.prepare("DELETE FROM user WHERE id != 'sentinel-owner'"),
  ]);
}


import { createCurrencyGetHandler, createCurrencyPatchHandler } from "../../src/app/api/crm/currency/route";
import { createCompaniesPostHandler } from "../../src/app/api/crm/companies/route";
import { createDealsPostHandler } from "../../src/app/api/crm/deals/route";
import { createDealPatchHandler } from "../../src/app/api/crm/deals/[dealId]/route";
import { applyD1Migrations, env as testEnv } from "cloudflare:test";
const mutate=(cookie:string,input:unknown)=>createCurrencyPatchHandler(root())(request("/api/crm/currency",cookie,"PATCH",input));
const settings=(cookie:string)=>createCurrencyGetHandler(root())(request("/api/crm/currency",cookie));
async function actor() {const result=await session("currency-owner@example.com");await env.DB.prepare("UPDATE singleton_membership SET role='owner' WHERE user_id=?").bind(result.id).run();return result;}
async function company(cookie:string) {return successful(await createCompaniesPostHandler(root())(request("/api/crm/companies",cookie,"POST",{name:"Money company"})));}
async function deal(cookie:string,owner:string,companyId:string,amountMinor:number|null,currency="USD") {return successful(await createDealsPostHandler(root())(request("/api/crm/deals",cookie,"POST",{name:"Money deal",companyId,ownerMembershipId:owner,amountMinor,currency})));}
const edit=(cookie:string,id:string,data:unknown)=>createDealPatchHandler(root(),Promise.resolve({dealId:id}))(request("/api/crm/deals/"+id,cookie,"PATCH",{action:"update",data}));
async function finish(cookie:string,value:any) {let current=value;for(let attempt=0;current.job&&attempt<10;attempt++)current=await successful(await mutate(cookie,{action:"resume",jobId:current.job.id}));expect(current.job).toBeNull();return current;}
async function conversion(id:string) {return env.DB.prepare("SELECT c.* FROM deal_conversion c JOIN crm_setting s ON s.active_conversion_version=c.version WHERE c.deal_id=?").bind(id).first<any>();}
describe.sequential("versioned currency persistence",()=>{
  beforeEach(clearState);
  it("rolls back job creation, conversion chunks and checkpoint failures before retrying",async()=>{
    const owner=await actor(),co=await company(owner.cookie);
    await env.DB.batch(Array.from({length:26},(_,index)=>env.DB.prepare("INSERT INTO deal(id,name,company_id,owner_membership_id,stage_id,stage_changed_at,currency,amount_minor,created_at,updated_at) VALUES(?, 'Boundary',?,?,'demo-booked',0,'USD',100,0,0)").bind("boundary-"+String(index).padStart(3,"0"),co.id,owner.id)));
    await successful(await mutate(owner.cookie,{action:"set_manual_rate",baseCurrency:"EUR",currency:"USD",rate:"2"}));
    await env.DB.exec("CREATE TRIGGER reject_job_creation BEFORE INSERT ON currency_job BEGIN SELECT RAISE(ABORT,'forced creation failure'); END");
    try {
      expect((await mutate(owner.cookie,{action:"set_reporting_currency",currency:"EUR"})).status).toBe(500);
      expect((await successful(await settings(owner.cookie))).job).toBeNull();
      expect(await env.DB.prepare("SELECT count(*) AS count FROM currency_job").first()).toEqual({count:0});
      expect(await env.DB.prepare("SELECT count(*) AS count FROM member_operation_guard").first()).toEqual({count:0});
    }finally{await env.DB.exec("DROP TRIGGER reject_job_creation");}
    const started=await successful(await mutate(owner.cookie,{action:"set_reporting_currency",currency:"EUR"}));
    const jobId=started.job.id;
    for(const trigger of [
      "CREATE TRIGGER reject_boundary BEFORE INSERT ON deal_conversion WHEN NEW.deal_id='boundary-005' BEGIN SELECT RAISE(ABORT,'forced middle chunk failure'); END",
      "CREATE TRIGGER reject_boundary BEFORE UPDATE OF processed ON currency_job BEGIN SELECT RAISE(ABORT,'forced checkpoint failure'); END"
    ]) {
      await env.DB.exec(trigger);
      try {
        expect((await mutate(owner.cookie,{action:"resume",jobId})).status).toBe(500);
        const state=await successful(await settings(owner.cookie));
        expect(state).toMatchObject({activeVersion:started.activeVersion,reportingCurrency:"USD",job:{id:jobId,processed:0}});
        expect(await env.DB.prepare("SELECT count(*) AS count FROM deal_conversion WHERE version=?").bind(jobId).first()).toEqual({count:0});
        expect(await env.DB.prepare("SELECT count(*) AS count FROM member_operation_guard").first()).toEqual({count:0});
      }finally{await env.DB.exec("DROP TRIGGER reject_boundary");}
    }
    const partial=await successful(await mutate(owner.cookie,{action:"resume",jobId}));
    expect(partial.job.processed).toBe(25);
    await expect(env.DB.prepare("DELETE FROM deal WHERE id='boundary-000'").run()).rejects.toThrow(/currency_job_pending/);
    const cancelled=await successful(await mutate(owner.cookie,{action:"cancel",jobId}));
    expect(cancelled).toMatchObject({activeVersion:started.activeVersion,reportingCurrency:"USD",job:null});
    expect(await env.DB.prepare("SELECT count(*) AS count FROM deal_conversion WHERE version=?").bind(jobId).first()).toEqual({count:25});
    await finish(owner.cookie,await successful(await mutate(owner.cookie,{action:"set_reporting_currency",currency:"EUR"})));
    expect((await successful(await settings(owner.cookie))).reportingCurrency).toBe("EUR");
  });
  it("serializes concurrent money edits and keeps originals and conversion in one transaction",async()=>{
    const owner=await actor(),co=await company(owner.cookie),row=await deal(owner.cookie,owner.id,co.id,100);
    const results=await Promise.all([edit(owner.cookie,row.id,{amountMinor:111}),edit(owner.cookie,row.id,{amountMinor:222})]);
    expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    const original=await env.DB.prepare("SELECT amount_minor,money_revision FROM deal WHERE id=?").bind(row.id).first<any>();
    expect(original.money_revision).toBe(1);
    expect([111,222]).toContain(original.amount_minor);
    expect(await conversion(row.id)).toMatchObject({amount_minor:original.amount_minor,base_amount_minor:original.amount_minor,money_revision:1});
    await env.DB.exec("CREATE TRIGGER reject_money_conversion BEFORE UPDATE ON deal_conversion BEGIN SELECT RAISE(ABORT,'forced conversion failure'); END");
    try {expect((await edit(owner.cookie,row.id,{amountMinor:333,stageId:"qualified-to-buy"})).status).toBe(500);
      expect(await env.DB.prepare("SELECT amount_minor,money_revision FROM deal WHERE id=?").bind(row.id).first()).toEqual(original);
      expect(await env.DB.prepare("SELECT count(*) AS count FROM activity WHERE deal_id=? AND type='stage_change'").bind(row.id).first()).toEqual({count:0});
    }finally{await env.DB.exec("DROP TRIGGER reject_money_conversion");}
  });
  it("upgrades scaled legacy rates exactly and retains original unconverted deals",async()=>{
    const db=testEnv.UPGRADE_DB;
    await applyD1Migrations(db,testEnv.TEST_MIGRATIONS.slice(0,4));
    await db.batch([
      db.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES('legacy-owner','Legacy','legacy@example.com',1,0,0)"),
      db.prepare("INSERT INTO singleton_membership(user_id,role,status,created_at,updated_at) VALUES('legacy-owner','owner','active',0,0)"),
      db.prepare("INSERT INTO company(id,name,owner_membership_id,created_at,updated_at) VALUES('legacy-company','Legacy','legacy-owner',0,0)"),
      db.prepare("INSERT INTO deal(id,name,company_id,owner_membership_id,stage_id,stage_changed_at,amount_minor,currency,base_amount_minor,base_currency,fx_rate_scaled,fx_rate_at,created_at,updated_at) VALUES('legacy-deal','Legacy','legacy-company','legacy-owner','demo-booked',0,150,'ZZZ',777,'EUR',10000000000,123,0,0)"),
      db.prepare("INSERT INTO exchange_rate(id,base_currency,quote_currency,rate_scaled,source,as_of,created_at,updated_at) VALUES('precise','USD','EUR',9223372036854775807,'manual',123,456,789),('integer','USD','JPY',10000000000,'fetched',100,200,300)")
    ]);
    await applyD1Migrations(db,testEnv.TEST_MIGRATIONS.slice(4));
    expect((await db.prepare("SELECT id,rate,as_of,created_at,updated_at FROM exchange_rate ORDER BY id").all()).results).toEqual([
      {id:"integer",rate:"1",as_of:100,created_at:200,updated_at:300},
      {id:"precise",rate:"922337203.6854775807",as_of:123,created_at:456,updated_at:789}
    ]);
    expect(await db.prepare("SELECT amount_minor,currency,base_amount_minor,base_currency,money_revision FROM deal WHERE id='legacy-deal'").first()).toEqual({amount_minor:150,currency:"ZZZ",base_amount_minor:777,base_currency:"EUR",money_revision:0});
    expect(await db.prepare("SELECT count(*) AS count FROM deal_conversion").first()).toEqual({count:0});
    expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
  it("prefers manual rates, preserves frozen values and fills only absent conversions",async()=>{
    const owner=await actor(),co=await company(owner.cookie);
    await env.DB.prepare("INSERT INTO exchange_rate(id,base_currency,quote_currency,rate,source,as_of,created_at,updated_at) VALUES('fetched','USD','EUR','1.1','fetched',1000,1000,1000)").run();
    const fetched=await deal(owner.cookie,owner.id,co.id,100,"EUR");
    expect(await conversion(fetched.id)).toMatchObject({base_amount_minor:110,rate_source:"fetched",fx_rate:"1.1",fx_rate_at:1000});
    const missing=await deal(owner.cookie,owner.id,co.id,200,"CHF");
    expect((await conversion(missing.id)).base_amount_minor).toBeNull();
    const state=await successful(await mutate(owner.cookie,{action:"set_manual_rate",baseCurrency:"USD",currency:"EUR",rate:"1.25"}));
    expect(state.rates).toContainEqual(expect.objectContaining({currency:"EUR",source:"manual",overriding:true,rate:"1.25"}));
    await finish(owner.cookie,state);
    expect((await conversion(fetched.id)).base_amount_minor).toBe(110);
    const manual=await deal(owner.cookie,owner.id,co.id,100,"EUR");
    expect(await conversion(manual.id)).toMatchObject({base_amount_minor:125,rate_source:"manual"});
    await finish(owner.cookie,await successful(await mutate(owner.cookie,{action:"set_manual_rate",baseCurrency:"USD",currency:"CHF",rate:"0.5"})));
    expect((await conversion(missing.id)).base_amount_minor).toBe(100);
    expect((await conversion(fetched.id)).base_amount_minor).toBe(110);
    const frozen=await conversion(manual.id);
    await successful(await edit(owner.cookie,manual.id,{name:"Renamed",stageId:"qualified-to-buy"}));
    expect(await conversion(manual.id)).toEqual(frozen);
    await successful(await edit(owner.cookie,manual.id,{amountMinor:200}));
    expect(await conversion(manual.id)).toMatchObject({base_amount_minor:250,amount_minor:200,money_revision:1});
    await successful(await mutate(owner.cookie,{action:"remove_manual_rate",baseCurrency:"USD",currency:"EUR"}));
    expect((await successful(await settings(owner.cookie))).rates).toContainEqual(expect.objectContaining({currency:"EUR",source:"fetched",rate:"1.1"}));
    expect((await conversion(manual.id)).base_amount_minor).toBe(250);
  });
  it("checkpoints 25 rows, excludes concurrent mutations, preserves history and atomically flips versions",async()=>{
    const owner=await actor(),co=await company(owner.cookie);
    const ids=Array.from({length:51},(_,index)=>"00000000-0000-4000-8000-"+String(index).padStart(12,"0"));
    await env.DB.batch(ids.map(id=>env.DB.prepare("INSERT INTO deal(id,name,company_id,owner_membership_id,stage_id,stage_changed_at,currency,amount_minor,created_at,updated_at) VALUES(?, 'Legacy',?,?,'demo-booked',0,'USD',100,0,0)").bind(id,co.id,owner.id)));
    await finish(owner.cookie,await successful(await mutate(owner.cookie,{action:"fill_missing"})));
    await successful(await mutate(owner.cookie,{action:"set_manual_rate",baseCurrency:"EUR",currency:"USD",rate:"2"}));
    const started=await successful(await mutate(owner.cookie,{action:"set_reporting_currency",currency:"EUR"}));
    const id=started.job.id,oldVersion=started.activeVersion;
    expect(started).toMatchObject({reportingCurrency:"USD",job:{processed:0,total:51}});
    const first=await successful(await mutate(owner.cookie,{action:"resume",jobId:id}));
    expect(first).toMatchObject({activeVersion:oldVersion,reportingCurrency:"USD",job:{processed:25,total:51,status:"running"}});
    expect(await env.DB.prepare("SELECT count(*) AS count FROM deal_conversion WHERE version=?").bind(id).first()).toEqual({count:25});
    expect((await edit(owner.cookie,ids[0],{amountMinor:200})).status).toBe(409);
    expect((await createDealsPostHandler(root())(request("/api/crm/deals",owner.cookie,"POST",{name:"Locked",companyId:co.id,ownerMembershipId:owner.id}))).status).toBe(409);
    expect((await mutate(owner.cookie,{action:"set_manual_rate",baseCurrency:"EUR",currency:"USD",rate:"3"})).status).toBe(409);
    expect((await mutate(owner.cookie,{action:"set_reporting_currency",currency:"JPY"})).status).toBe(409);
    await successful(await edit(owner.cookie,ids[0],{stageId:"qualified-to-buy"}));
    expect(await env.DB.prepare("SELECT count(*) AS count FROM activity WHERE type='stage_change' AND deal_id=?").bind(ids[0]).first()).toEqual({count:1});
    const concurrent=await Promise.all([mutate(owner.cookie,{action:"resume",jobId:id}),mutate(owner.cookie,{action:"resume",jobId:id})]);
    expect(concurrent.map(r=>r.status).sort()).toEqual([200,409]);
    const second=await successful(await settings(owner.cookie));
    expect(second.job.processed).toBe(50);expect(second.activeVersion).toBe(oldVersion);
    await env.DB.exec("CREATE TRIGGER reject_version_flip BEFORE UPDATE OF active_conversion_version ON crm_setting WHEN NEW.active_conversion_version != OLD.active_conversion_version BEGIN SELECT RAISE(ABORT,'forced flip failure'); END");
    try {expect((await mutate(owner.cookie,{action:"resume",jobId:id})).status).toBe(500);
      expect((await successful(await settings(owner.cookie))).job.processed).toBe(50);
      expect(await env.DB.prepare("SELECT count(*) AS count FROM deal_conversion WHERE version=?").bind(id).first()).toEqual({count:50});
    }finally{await env.DB.exec("DROP TRIGGER reject_version_flip");}
    const completed=await successful(await mutate(owner.cookie,{action:"resume",jobId:id}));
    expect(completed).toMatchObject({reportingCurrency:"EUR",activeVersion:id,job:null});
    expect(await env.DB.prepare("SELECT count(*) AS count,sum(base_amount_minor) AS total FROM deal_conversion WHERE version=?").bind(id).first()).toEqual({count:51,total:10200});
    expect((await successful(await mutate(owner.cookie,{action:"resume",jobId:id}))).activeVersion).toBe(id);
    expect(await env.DB.prepare("SELECT count(*) AS count FROM member_operation_guard").first()).toEqual({count:0});
  });
  it("cancels versions without activating them and guards owner-only settings",async()=>{
    const owner=await actor(),member=await session("currency-member@example.com"),co=await company(owner.cookie);
    await deal(owner.cookie,owner.id,co.id,100);
    expect((await successful(await settings(member.cookie))).canManage).toBe(false);
    expect((await mutate(member.cookie,{action:"set_reporting_currency",currency:"EUR"})).status).toBe(403);
    for(const rate of ["0","-1","1e3","1.12345678901"])expect((await mutate(owner.cookie,{action:"set_manual_rate",baseCurrency:"USD",currency:"EUR",rate})).status).toBe(400);
    expect((await mutate(owner.cookie,{action:"set_manual_rate",baseCurrency:"USD",currency:"USD",rate:"2"})).status).toBe(400);
    const start=await successful(await mutate(owner.cookie,{action:"set_reporting_currency",currency:"EUR"}));
    const cancelled=await successful(await mutate(owner.cookie,{action:"cancel",jobId:start.job.id}));
    expect(cancelled).toMatchObject({reportingCurrency:"USD",activeVersion:start.activeVersion,job:null});
    expect((await successful(await mutate(owner.cookie,{action:"resume",jobId:start.job.id}))).activeVersion).toBe(start.activeVersion);
    await deal(owner.cookie,owner.id,co.id,200);
    expect((await settings("")).status).toBe(401);
  });
});
