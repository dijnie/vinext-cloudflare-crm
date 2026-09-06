import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { handleAuthRequest } from "@/lib/auth/auth";
import { createCompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import type { AuthEmailAdapter, AuthEmailMessage } from "@/lib/email/email-adapter";
import { requireRequestContext } from "@/lib/http/request-context";
import { createReportExportHandler } from "../../src/app/api/crm/reports/export/route";
import { createReportsGetHandler } from "../../src/app/api/crm/reports/route";

class Email implements AuthEmailAdapter { messages: AuthEmailMessage[] = []; async sendVerification(message: AuthEmailMessage) { this.messages.push(message); } async sendPasswordReset() {} }
const bindings = env as RuntimeEnv, root = () => createCompositionRoot(bindings, new Email()); let index = 100;
async function session(email: string) {
  const adapter = new Email(), app = createCompositionRoot(bindings, adapter), password = "correct horse battery staple";
  const headers = { origin: "https://auth.test", "content-type": "application/json", "cf-connecting-ip": `198.51.100.${++index}` };
  const auth = (path: string, body: unknown) => handleAuthRequest(new Request(`https://auth.test/api/auth/${path}`, { method: "POST", headers, body: JSON.stringify(body) }), app.auth, app.db, bindings.AUTH_BASE_URL);
  await auth("sign-up/email", { name: email, email, password }); const token = new URL(adapter.messages.at(-1)!.url).searchParams.get("token")!;
  await app.auth.api.verifyEmail({ asResponse: true, headers: new Headers({ origin: "https://auth.test" }), query: { token } });
  const response = await auth("sign-in/email", { email, password }), cookie = response.headers.get("set-cookie")!.split(";", 1)[0];
  const user = await app.db.query.user.findFirst({ where: (fields, { eq }) => eq(fields.email, email) }); return { id: user!.id, cookie };
}
const request = (path: string, cookie?: string) => new Request(`https://auth.test${path}`, { headers: cookie ? { cookie } : undefined });
const orderSql = `INSERT INTO sales_order(id,number,name,contact_id,owner_membership_id,creator_user_id,currency,state,source,creation_fingerprint,creation_result_json,lines_json,goods_minor,discount_minor,surcharge_minor,tax_minor,original_minor,goods_remaining_minor,surcharge_remaining_minor,tax_remaining_minor,collected_minor,refunded_minor,completed_at,completed_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'completed',?,?,'{}',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

describe.sequential("reconciled management reports", () => {
  it("reconciles dates, refunds, costs, repeat customers, lead cohorts and reopened work", async () => {
    const actor = await session("report-owner@example.com"), other = await session("report-other@example.com");
    await env.DB.prepare("UPDATE singleton_membership SET role='owner' WHERE user_id=?").bind(actor.id).run();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO contact(id,first_name,birth_date,gender,created_at,updated_at) VALUES('report-c1','Customer','1996-09-20','female',0,0),('report-c2','No cost',NULL,NULL,0,0),('report-c3','Tax only',NULL,NULL,0,0)"),
      env.DB.prepare(orderSql).bind("report-current", 7101, "=FORMULA", "report-c1", actor.id, actor.id, "USD", "referral", "fp-current", JSON.stringify([{ variantId: "report-v1", quantity: 2, costMinor: 300 }]), 1000, 100, 50, 100, 1050, 900, 50, 100, 0, 0, Date.parse("2026-09-10T10:00:00Z"), "2026-09-10", 1, 1),
      env.DB.prepare(orderSql).bind("report-prior", 7102, "Prior", "report-c1", actor.id, actor.id, "USD", "walk-in", "fp-prior", JSON.stringify([{ variantId: "report-v1", quantity: 1, costMinor: 200 }]), 500, 0, 0, 0, 500, 500, 0, 0, 0, 0, Date.parse("2026-08-30T10:00:00Z"), "2026-08-30", 1, 1),
      env.DB.prepare(orderSql).bind("report-missing", 7103, "Missing cost", "report-c2", actor.id, other.id, "USD", "referral", "fp-missing", JSON.stringify([{ variantId: "report-v2", quantity: 1, costMinor: null }]), 300, 0, 0, 0, 300, 300, 0, 0, 0, 0, Date.parse("2026-09-11T10:00:00Z"), "2026-09-11", 1, 1),
      env.DB.prepare(orderSql).bind("report-eur", 7104, "Euro", "report-c1", actor.id, actor.id, "EUR", "referral", "fp-eur", "[]", 900, 0, 0, 0, 900, 900, 0, 0, 0, 0, Date.parse("2026-09-12T10:00:00Z"), "2026-09-12", 1, 1),
      env.DB.prepare(orderSql).bind("report-tax-only", 7105, "Tax only", "report-c3", actor.id, actor.id, "USD", "referral", "fp-tax", "[]", 0, 0, 0, 50, 50, 0, 0, 50, 0, 0, Date.parse("2026-09-13T10:00:00Z"), "2026-09-13", 1, 1),
      env.DB.prepare("INSERT INTO order_operation(id,order_id,action,fingerprint,result_json,actor_id,business_date,time_zone,created_at) VALUES('op-complete','report-current','complete','x','{}',?,'2026-09-10','UTC',1),('op-confirm','report-current','confirm','y','{}',?,'2026-09-09','UTC',1),('op-adjust','report-current','adjust','z','{}',?,'2026-09-15','UTC',1),('op-collect','report-current','collection','c','{}',?,'2026-09-16','UTC',1),('op-refund','report-current','refund','r','{}',?,'2026-09-17','UTC',1)").bind(actor.id, actor.id, actor.id, actor.id, actor.id),
      env.DB.prepare("INSERT INTO order_adjustment(id,order_id,operation_id,goods_minor,surcharge_minor,tax_minor,reason,business_date,time_zone,actor_id,created_at) VALUES('adj','report-current','op-adjust',100,0,0,'Return','2026-09-15','UTC',?,1)").bind(actor.id),
      env.DB.prepare("INSERT INTO order_payment(id,order_id,operation_id,kind,amount_minor,currency,method,actor_id,business_date,time_zone,created_at) VALUES('pay','report-current','op-collect','collection',800,'USD','cash',?,'2026-09-16','UTC',1),('refund','report-current','op-refund','refund',100,'USD','cash',?,'2026-09-17','UTC',1)").bind(actor.id, actor.id),
      env.DB.prepare("INSERT INTO lead(id,first_name,source_id,status_id,owner_membership_id,creator_user_id,revision,created_at,updated_at) VALUES('lead-late','Late','manual','new',?,?,0,?,1)").bind(actor.id, actor.id, Date.parse("2026-09-02T00:00:00Z")),
      env.DB.prepare("INSERT INTO lead(id,first_name,source_id,status_id,owner_membership_id,creator_user_id,revision,converted_at,converted_contact_id,created_at,updated_at) VALUES('lead-fast','Fast','manual','converted',?,?,1,?,'report-c1',?,1)").bind(actor.id, actor.id, Date.parse("2026-09-04T00:00:00Z"), Date.parse("2026-09-03T00:00:00Z")),
      env.DB.prepare("INSERT INTO lead_conversion(id,lead_id,operation_key,fingerprint,actor_id,contact_id,mode,lead_revision,mapping_revision,snapshot_json,result_json,completed_at) VALUES('lc-fast','lead-fast','lc-fast','x',?,'report-c1','link',0,0,'{}','{}',?)").bind(actor.id, Date.parse("2026-09-04T00:00:00Z")),
      env.DB.prepare("INSERT INTO activity(id,type,subject,contact_id,author_user_id,created_at,updated_at) VALUES('task-done','task','Done','report-c1',?,1,1),('task-open','task','Open','report-c1',?,1,1)").bind(actor.id, actor.id),
      env.DB.prepare("INSERT INTO task_record(activity_id,assignee_membership_id,current_cycle,due_at,completed_at,created_at,updated_at) VALUES('task-done',?,1,?, ?,1,1),('task-open',?,1,?,NULL,1,1)").bind(actor.id, Date.parse("2026-09-05T00:00:00Z"), Date.parse("2026-09-04T00:00:00Z"), actor.id, Date.parse("2026-09-02T00:00:00Z")),
      env.DB.prepare("INSERT INTO task_cycle(task_id,cycle,opened_at,opened_by,due_at,completed_at) VALUES('task-done',1,1,?,?,?),('task-open',1,1,?,?,NULL)").bind(actor.id, Date.parse("2026-09-05T00:00:00Z"), Date.parse("2026-09-04T00:00:00Z"), actor.id, Date.parse("2026-09-02T00:00:00Z")),
      env.DB.prepare("INSERT INTO ticket(id,number,subject,priority,source,assignee_membership_id,creator_user_id,status,current_cycle,created_at,updated_at) VALUES('ticket',8101,'Ticket','normal','manual',?,?,'open',2,1,1)").bind(actor.id, actor.id),
      env.DB.prepare("INSERT INTO ticket_cycle(ticket_id,cycle,opened_at,opened_by,due_at,resolved_at,first_response_at) VALUES('ticket',1,?,?,?, ?,?),('ticket',2,?,?,?,NULL,NULL)").bind(Date.parse("2026-09-01T00:00:00Z"), actor.id, Date.parse("2026-09-06T00:00:00Z"), Date.parse("2026-09-05T00:00:00Z"), Date.parse("2026-09-01T01:00:00Z"), Date.parse("2026-09-07T00:00:00Z"), actor.id, Date.parse("2026-09-08T00:00:00Z")),
      env.DB.prepare("UPDATE sales_order SET archived_at=1 WHERE id='report-current'"),
    ]);
    const context = await requireRequestContext(new Headers({ cookie: actor.cookie }), root()), report = await root().reports.summary(context, { from: "2026-09-01", to: "2026-09-20", scope: "me" }, new Date("2026-09-20T12:00:00Z"));
    expect(report.sales).toMatchObject({ orderValueMinor: "1250", adjustmentMinor: "100", collectionsMinor: "800", refundsMinor: "100", averageOrderMinor: "416", grossProfitMinor: null });
    expect(report.coverage).toMatchObject({ includedOrders: 3, excludedOrders: 1, costCompleteOrders: 2, costCoverage: 2 / 3 });
    expect(report.customers).toMatchObject({ repeatWindowContacts: 3, repeatContacts: 1, repeatRate: 1 / 3 });
    expect(report.customers.ages).toContainEqual({ key: "25-34", count: 1, rate: 1 / 3 });
    expect(report.leads).toMatchObject({ cohort: 2, convertedFromCohort: 1, cohortRate: 0.5, convertedInPeriod: 1 });
    expect(report.work).toMatchObject({ openOverdueTasks: 1, completedTasksOnTime: 1, openOverdueTickets: 1, resolvedTicketsOnTime: 1, averageFirstResponseMinutes: 60, averageResolutionMinutes: 5760 });
    expect(report.comparison).toMatchObject({ previousFrom: "2026-08-12", previousTo: "2026-08-31", previousMinor: "500" });
    expect(report.query).toMatchObject({ statements: 14 }); expect(report.query.rowsRead).toBeGreaterThan(0);
    const running = await root().reports.summary(context, { from: "2026-09-01", to: "2026-09-30", scope: "me" }, new Date("2026-09-10T12:00:00Z"));
    expect(running.coverage.includedOrders).toBe(1); expect(running.comparison).toMatchObject({ previousFrom: "2026-08-22", previousTo: "2026-08-31" });
    await root().reports.setGoal(context, { from: "2026-09-01", to: "2026-09-20", scopeKind: "member", scopeId: actor.id, amountMinor: "2500" });
    await expect(root().reports.setGoal(context, { from: "2026-09-01", to: "2026-09-20", scopeKind: "member", scopeId: actor.id, amountMinor: "9007199254740993" })).rejects.toBeTruthy();
    await expect(root().reports.summary(context, { from: "2026-09-01", to: "2026-09-20", scope: "me" }, new Date("2026-09-20T12:00:00Z"))).resolves.toMatchObject({ goal: { amountMinor: "2500", progressRate: 0.5, scopeKind: "member" } });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO branch(id,name,created_at,updated_at) VALUES('report-branch','Reporting branch',1,1)"),
      env.DB.prepare("INSERT INTO member_branch(membership_id,branch_id,is_primary) VALUES(?,'report-branch',1)").bind(actor.id),
    ]);
    await root().reports.setGoal(context, { from: "2026-09-01", to: "2026-09-20", scopeKind: "branch", scopeId: "report-branch", amountMinor: "5000" });
    await expect(root().reports.summary(context, { from: "2026-09-01", to: "2026-09-20", scope: "branch", scopeId: "report-branch" }, new Date("2026-09-20T12:00:00Z"))).resolves.toMatchObject({ goal: { amountMinor: "5000", progressRate: 0.25, scopeKind: "branch" } });
    await expect(root().reports.summary(context, { from: "2026-09-01", to: "2026-09-20", scope: "member", scopeId: other.id }, new Date("2026-09-20T12:00:00Z"))).resolves.toMatchObject({ coverage: { includedOrders: 0 } });
  });

  it("keeps view and Excel permissions separate and neutralizes spreadsheet formulas", async () => {
    const member = await session("report-export@example.com"), context = await requireRequestContext(new Headers({ cookie: member.cookie }), root());
    await env.DB.prepare("INSERT INTO contact(id,first_name,created_at,updated_at) VALUES('export-c','Export',0,0)").run();
    await env.DB.prepare(orderSql).bind("export-order", 7201, "+DANGER", "export-c", member.id, member.id, "USD", "manual", "fp-export", "[]", 100, 0, 0, 0, 100, 100, 0, 0, 0, 0, Date.parse("2026-09-05T00:00:00Z"), "2026-09-05", 1, 1).run();
    await expect(root().reports.summary(context, { from: "2026-09-01", to: "2026-09-20", scope: "me" })).resolves.toMatchObject({ capabilities: { export: false } });
    const path = "/api/crm/reports/export?from=2026-09-01&to=2026-09-20&scope=me", handler = createReportExportHandler(root());
    expect((await handler(request(path, member.cookie))).status).toBe(403);
    await env.DB.prepare("INSERT INTO access_grant(profile_id,permission) VALUES('standard-member','report.export')").run();
    const response = await handler(request(path, member.cookie)); expect(response.status).toBe(200); expect(response.headers.get("content-type")).toContain("spreadsheetml");
    const archive = unzipSync(new Uint8Array(await response.arrayBuffer())), sheet = strFromU8(archive["xl/worksheets/sheet1.xml"]!);
    expect(sheet).toContain(">'+DANGER"); expect(sheet).toContain("Repeat rate"); expect(sheet).toContain("Converted from cohort"); expect(sheet).toContain("openOverdueTickets"); expect(sheet).not.toContain("><f>");
    const api = createReportsGetHandler(root()); expect((await api(request("/api/crm/reports?from=2026-09-20&to=2026-09-01", member.cookie))).status).toBe(400);
    expect((await api(request("/api/crm/reports?from=2026-02-31&to=2026-03-01", member.cookie))).status).toBe(400);
  });

  it("keeps report query and response work bounded for 1,000 completed orders", async () => {
    const actor = await session("report-volume@example.com");
    for (let offset = 0; offset < 1_000; offset += 50) {
      const statements: D1PreparedStatement[] = [];
      for (let item = 0; item < 50; item++) {
        const number = offset + item, contact = `report-volume-c-${number}`, order = `report-volume-o-${number}`;
        statements.push(env.DB.prepare("INSERT INTO contact(id,first_name,created_at,updated_at) VALUES(?,?,0,0)").bind(contact, `Customer ${number}`));
        statements.push(env.DB.prepare(orderSql).bind(order, 9000 + number, `Order ${number}`, contact, actor.id, actor.id, "USD", "volume", `fp-volume-${number}`, "[]", 100, 0, 0, 0, 100, 100, 0, 0, 0, 0, Date.parse("2026-09-05T00:00:00Z"), "2026-09-05", 1, 1));
      }
      await env.DB.batch(statements);
    }
    const context = await requireRequestContext(new Headers({ cookie: actor.cookie }), root()), started = performance.now();
    const report = await root().reports.summary(context, { from: "2026-09-01", to: "2026-09-06", scope: "me" }, new Date("2026-09-06T12:00:00Z")), elapsedMs = performance.now() - started;
    expect(report.coverage.includedOrders).toBe(1_000); expect(report.query.statements).toBe(14); expect(report.query.rowsRead).toBeLessThan(50_000); expect(elapsedMs).toBeLessThan(5_000);
    console.info(JSON.stringify({ completedOrders: 1_000, statements: report.query.statements, rowsRead: report.query.rowsRead, elapsedMs: Math.round(elapsedMs) }));
  });

  it("rejects an operational detail section above the response bound", async () => {
    const actor = await session("report-work-bound@example.com"), context = await requireRequestContext(new Headers({ cookie: actor.cookie }), root());
    await env.DB.prepare("INSERT INTO ticket(id,number,subject,priority,source,assignee_membership_id,creator_user_id,status,current_cycle,created_at,updated_at) VALUES('report-bound-ticket',14999,'Bounded','normal','manual',?,?,'resolved',5001,1,1)").bind(actor.id, actor.id).run();
    for (let offset = 0; offset < 5_001; offset += 100) {
      const statements: D1PreparedStatement[] = [];
      for (let item = offset; item < Math.min(offset + 100, 5_001); item++) statements.push(env.DB.prepare("INSERT INTO ticket_cycle(ticket_id,cycle,opened_at,opened_by,resolved_at) VALUES('report-bound-ticket',?,?,?,?)").bind(item + 1, Date.parse("2026-09-01T00:00:00Z"), actor.id, Date.parse("2026-09-02T00:00:00Z")));
      await env.DB.batch(statements);
    }
    await expect(root().reports.summary(context, { from: "2026-09-01", to: "2026-09-06", scope: "me" }, new Date("2026-09-06T12:00:00Z"))).rejects.toMatchObject({ status: 400, code: "input_limit_exceeded" });
  });
});
