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


import { requireRequestContext } from "@/server/request-context";
import { DashboardRepository } from "@/modules/dashboard/dashboard-repository";
import { createDashboardGetHandler } from "../../src/app/api/crm/dashboard/route";
import { DealRepository } from "@/modules/crm/deals/deal-repository";
import { dealListInputSchema } from "@/modules/crm/contracts/deal-contract";
const NOW=new Date("2026-09-04T12:00:00.000Z");
async function context(cookie:string) {return requireRequestContext(new Headers({cookie}),root());}
async function fixture() {
  const actor=await session("dashboard@example.com"),other=await session("dashboard-other@example.com");
  await env.DB.prepare("INSERT INTO company(id,name,owner_membership_id,created_at,updated_at) VALUES('dashboard-company','Dashboard company',?,0,0)").bind(actor.id).run();
  return {actor,other};
}
async function seedDeal(id:string,owner:string,options:{stage?:string;amount?:number|null;base?:number|null;currency?:string;baseCurrency?:string;archived?:boolean;created?:string;closed?:string;expected?:string;version?:string;revision?:number}={}) {
  const created=Date.parse(options.created??"2026-09-01T00:00:00.000Z");
  await env.DB.prepare("INSERT INTO deal(id,name,company_id,owner_membership_id,stage_id,stage_changed_at,amount_minor,currency,created_at,updated_at,archived_at,closed_at,expected_close_at) VALUES(?,?,'dashboard-company',?,?,0,?,?,?,0,?,?,?)").bind(id,id,owner,options.stage??"demo-booked",options.amount===undefined?100:options.amount,options.currency??"USD",created,options.archived?1:null,options.closed?Date.parse(options.closed):null,options.expected?Date.parse(options.expected):null).run();
  if(options.base!==undefined&&options.base!==null) await env.DB.prepare("INSERT INTO deal_conversion(version,deal_id,money_revision,amount_minor,currency,base_amount_minor,base_currency,fx_rate,fx_rate_at,rate_source) VALUES(?,?,?,100,?,?,?,'1',0,'manual')").bind(options.version??"initial",id,options.revision??0,options.currency??"USD",options.base,options.baseCurrency??"USD").run();
}
describe.sequential("SQL dashboard summaries",()=>{
  beforeEach(clearState);
  it("sorts deals by frozen base amount rather than original mixed-currency amounts with nulls last",async()=>{
    const {actor}=await fixture();
    await seedDeal("large-original",actor.id,{amount:1000000,currency:"JPY",base:100});
    await seedDeal("large-base",actor.id,{amount:1,currency:"EUR",base:200});
    await seedDeal("unconverted",actor.id,{amount:999999999,currency:"CHF"});
    const repository=new DealRepository(root().db);
    const descending=await repository.list(dealListInputSchema.parse({sort:"amount",dir:"desc"}));
    expect(descending.rows.map(row=>row.id)).toEqual(["large-base","large-original","unconverted"]);
    const ascending=await repository.list(dealListInputSchema.parse({sort:"amount",dir:"asc"}));
    expect(ascending.rows.map(row=>row.id)).toEqual(["large-original","large-base","unconverted"]);
  });
  it("sums only compatible active base values while preserving separate counts, scopes and UTC windows",async()=>{
    const {actor,other}=await fixture();
    await seedDeal("open",actor.id,{base:125,currency:"EUR",expected:"2026-09-30T23:59:59.999Z"});
    await seedDeal("missing",actor.id,{currency:"CHF",expected:"2026-09-01T00:00:00.000Z"});
    await seedDeal("null-amount",actor.id,{amount:null});
    await seedDeal("wrong-base",actor.id,{base:999,baseCurrency:"EUR",currency:"GBP"});
    await seedDeal("wrong-version",actor.id,{base:888,version:"old",currency:"JPY"});
    await seedDeal("wrong-revision",actor.id,{base:777,revision:1,currency:"CAD"});
    await seedDeal("archived",actor.id,{base:10000,archived:true});
    await seedDeal("other-owner",other.id,{base:300,expected:"2026-10-01T00:00:00.000Z"});
    await seedDeal("won-start",actor.id,{base:200,stage:"closed-won",closed:"2026-09-01T00:00:00.000Z"});
    await seedDeal("won-prev",actor.id,{base:100,stage:"closed-won",created:"2026-08-01T00:00:00.000Z",closed:"2026-08-31T23:59:59.999Z"});
    await seedDeal("won-missing",actor.id,{stage:"closed-won",currency:"ZAR",closed:"2026-09-02T00:00:00.000Z"});
    await seedDeal("lost",actor.id,{base:900,stage:"closed-lost",closed:"2026-09-03T00:00:00.000Z"});
    const summary=await root().dashboard.summary(await context(actor.cookie),{scope:"me"},NOW);
    expect(summary.pipeline).toMatchObject({totalDeals:6,totalMinor:"125"});
    expect(summary.wonThisMonth).toEqual({count:2,valueMinor:"200"});
    expect(summary.wonPrevMonth).toEqual({count:1,valueMinor:"100"});
    expect(summary.closingThisMonthTotal).toEqual({count:1,valueMinor:"125"});
    expect(summary.unconverted).toEqual({count:5,currencies:["CAD","CHF","GBP","JPY","ZAR"]});
    expect(summary.performance).toMatchObject({wins:3,losses:1,winRate:0.75,avgDealMinor:"150"});
    expect(summary.trend).toHaveLength(6);
    expect(summary.trend[0].month).toBe("2026-04");
    expect(summary.trend[5]).toMatchObject({month:"2026-09",wonMinor:"200"});
    const everyone=await root().dashboard.summary(await context(actor.cookie),{scope:"everyone"},NOW);
    expect(everyone.pipeline).toMatchObject({totalDeals:7,totalMinor:"425"});
    expect(everyone.closingThisMonthTotal).toEqual({count:1,valueMinor:"125"});
    expect(summary.biggestOpen[0]).toMatchObject({id:"open",baseAmountMinor:125});
    expect(summary.biggestOpen).toHaveLength(6);
  });
  it("bounds tasks and activity, rejects unsafe scope and enforces authenticated access",async()=>{
    const {actor,other}=await fixture();
    for(let index=0;index<20;index++) await env.DB.prepare("INSERT INTO activity(id,type,subject,content,company_id,author_user_id,due_at,created_at,updated_at) VALUES(?,'task',?,?,'dashboard-company',?,?,?,0)").bind("task-"+index,"Task "+index,"x".repeat(2000),index%2?other.id:actor.id,NOW.getTime()-1000-index,NOW.getTime()-index).run();
    const me=await root().dashboard.summary(await context(actor.cookie),{scope:"me"},NOW);
    const all=await root().dashboard.summary(await context(actor.cookie),{scope:"everyone"},NOW);
    expect(me.overdueTasks).toHaveLength(10);expect(all.overdueTasks).toHaveLength(10);
    expect(me.recentActivity).toHaveLength(10);expect(all.recentActivity).toHaveLength(12);
    expect(me.recentActivity.every(row=>row.author.id===actor.id)).toBe(true);
    expect(all.recentActivity.every(row=>(row.content?.length??0)<=600)).toBe(true);
    const handler=createDashboardGetHandler(root());
    expect((await handler(request("/api/crm/dashboard"))).status).toBe(401);
    expect((await handler(request("/api/crm/dashboard?scope=admin",actor.cookie))).status).toBe(400);
    expect((await handler(request("/api/crm/dashboard?owner=other",actor.cookie))).status).toBe(400);
    await env.DB.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id=?").bind(other.id).run();
    expect((await handler(request("/api/crm/dashboard",other.cookie))).status).toBe(403);
  });
  it("keeps exact large totals and bounded indexed SQL budgets at representative volume",async()=>{
    const {actor,other}=await fixture();
    const size=2000,base=Number.MAX_SAFE_INTEGER;
    for(let offset=0;offset<size;offset+=100) await env.DB.batch(Array.from({length:100},(_,n)=>{
      const index=offset+n,id="volume-"+String(index).padStart(4,"0");
      return [
        env.DB.prepare("INSERT INTO deal(id,name,company_id,owner_membership_id,stage_id,stage_changed_at,amount_minor,currency,created_at,updated_at,archived_at) VALUES(?,?,'dashboard-company',?,'demo-booked',0,99999999999999,'USD',?,0,?)").bind(id,id,index%2?other.id:actor.id,NOW.getTime(),index%10===0?1:null),
        env.DB.prepare("INSERT INTO deal_conversion(version,deal_id,money_revision,amount_minor,currency,base_amount_minor,base_currency,fx_rate,fx_rate_at,rate_source) VALUES('initial',?,0,99999999999999,'USD',?,'USD','90',0,'manual')").bind(id,base)
      ];
    }).flat());
    await env.DB.batch(Array.from({length:100},(_,index)=>env.DB.prepare("INSERT INTO activity(id,type,subject,content,company_id,author_user_id,due_at,created_at,updated_at) VALUES(?,'task','Volume',?,'dashboard-company',?,?,?,0)").bind("volume-task-"+index,"x".repeat(2000),index%2?other.id:actor.id,NOW.getTime()-1000,NOW.getTime()-index)));
    const repository=new DashboardRepository(root().db),ctx=await context(actor.cookie);
    for(const scope of ["me","everyone"] as const) {
      const snapshot=await repository.snapshot(actor.id,{scope},NOW);
      const summary=await root().dashboard.summary(ctx,{scope},NOW);
      const count=scope==="me"?800:1800;
      expect(summary.pipeline).toMatchObject({totalDeals:count,totalMinor:(BigInt(base)*BigInt(count)).toString()});
      expect(snapshot.statements).toBe(11);
      expect(snapshot.rowsRead).toBeLessThanOrEqual(200_000);
      const bytes=new TextEncoder().encode(JSON.stringify(summary)).length;
      expect(bytes).toBeLessThanOrEqual(32_768);
      const plans=await env.DB.batch<{detail:string}>(repository.statements(actor.id,{scope},NOW,true));
      const details=plans.flatMap(plan=>plan.results.map(row=>row.detail));
      for(let index=1;index<=8;index++) {
        const detail=plans[index].results.map(row=>row.detail).join("\n");
        expect(detail).toMatch(/SEARCH c USING INDEX sqlite_autoindex_deal_conversion/);
        expect(detail).toMatch(/SEARCH d USING INDEX/);
      }
      console.info(JSON.stringify({scope,deals:size,activities:100,rowsRead:snapshot.rowsRead,responseBytes:bytes,plans:details}));
    }
  });
});
