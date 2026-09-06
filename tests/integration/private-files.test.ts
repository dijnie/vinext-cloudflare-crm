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

import { createFieldsPostHandler } from "../../src/app/api/crm/fields/route";
import { createFieldPatchHandler } from "../../src/app/api/crm/fields/[fieldId]/route";
import { createFieldValuesPatchHandler } from "../../src/app/api/crm/fields/values/route";
import { createCompaniesPostHandler } from "../../src/app/api/crm/companies/route";
import { createContactsPostHandler } from "../../src/app/api/crm/contacts/route";
import { createDealsPostHandler } from "../../src/app/api/crm/deals/route";
const create = (cookie: string, input: unknown) => createFieldsPostHandler(root())(request("/api/crm/fields", cookie, "POST", input));
const patch = (cookie: string, id: string, input: unknown) => createFieldPatchHandler(root(), id)(request("/api/crm/fields/"+id, cookie, "PATCH", input));
const write = (cookie: string, entity: string, recordId: string, values: unknown) => createFieldValuesPatchHandler(root())(request("/api/crm/fields/values", cookie, "PATCH", {entity,recordId,values}));
async function record(cookie: string, entity: string, owner: string): Promise<any> {
  if(entity==="company") return successful(await createCompaniesPostHandler(root())(request("/api/crm/companies",cookie,"POST",{name:"Field record"})));
  if(entity==="contact") return successful(await createContactsPostHandler(root())(request("/api/crm/contacts",cookie,"POST",{firstName:"Field record"})));
  const company = await record(cookie,"company",owner);
  return successful(await createDealsPostHandler(root())(request("/api/crm/deals",cookie,"POST",{name:"Field record",companyId:company.id,ownerMembershipId:owner})));
}
import { createFilesPostHandler } from "../../src/app/api/crm/files/route";
import { createFileGetHandler } from "../../src/app/api/crm/files/[fileId]/route";
import { createFileDownloadHandler } from "../../src/app/api/crm/files/[fileId]/download/route";
import { FileService } from "@/lib/services/files/file-service";
import { DraftService } from "@/lib/services/record-drafts/draft-service";
import { createRecordDraftsPostHandler } from "../../src/app/api/crm/record-drafts/route";
import { requireRequestContext } from "@/lib/http/request-context";
function uploadRequest(cookie: string, recordId: string, fieldId: string, body: Uint8Array = new Uint8Array([0,1,2,255]), name = "hợp đồng.txt", origin = "https://auth.test") {
  return new Request(`https://auth.test/api/crm/files?${new URLSearchParams({ entity:"company", recordId, fieldId })}`, { method:"POST", headers:{cookie, origin,"content-type":"application/octet-stream","x-file-name":encodeURIComponent(name)}, body:body as BodyInit });
}
async function setup() {
  const actor = await session(`files-${crypto.randomUUID()}@example.com`);
  const field = await successful(await create(actor.cookie,{entity:"company",label:"Documents",type:"file"}));
  const item = await record(actor.cookie,"company",actor.id);
  return { actor, field, item };
}
describe.sequential("private file storage", () => {
  beforeEach(clearState);
  it("consumes a reservation only with its atomic record and attachment writes", async () => {
    const { actor, field } = await setup(); const composition = root();
    const context = await requireRequestContext(new Headers({ cookie: actor.cookie }), composition);
    const drafts = new DraftService(composition.db); const draft = await drafts.create(context, { entity: "company" });
    const file = await composition.files.upload(context, { entity: "company", recordId: draft.id, draftId: draft.id, fieldId: field.id }, uploadRequest(actor.cookie, draft.id, field.id));
    const prepare = async () => {
      const reservation = await drafts.prepareConsumption(context, "company", draft.id);
      return reservation;
    };
    const first = await prepare(), simultaneous = await prepare();
    const item = await composition.companies.create(context, { name: "Reserved company", customFields: { [field.key]: [file.id] } }, first);
    expect(item.id).toBe(draft.id);
    await expect(composition.companies.create(context, { name: "Duplicate" }, simultaneous)).rejects.toMatchObject({ status: 409 });
    await expect(prepare()).rejects.toMatchObject({ status: 409 });
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM company WHERE id=?").bind(draft.id).first<any>()).count).toBe(1);
    expect((await env.DB.prepare("SELECT consumed_at FROM record_draft WHERE id=?").bind(draft.id).first<any>()).consumed_at).toBeGreaterThan(0);
    const failed = await drafts.create(context, { entity: "company" });
    const reservation = await drafts.prepareConsumption(context, "company", failed.id);
    await expect(composition.companies.create(context, { name: "Invalid files", customFields: { [field.key]: [file.id] } }, reservation)).rejects.toBeDefined();
    expect(await env.DB.prepare("SELECT id FROM company WHERE id=?").bind(failed.id).first()).toBeNull();
    expect((await env.DB.prepare("SELECT consumed_at FROM record_draft WHERE id=?").bind(failed.id).first<any>()).consumed_at).toBeNull();
  });
  it("reserves a private future record without placeholders and denies consumed or expired access", async () => {
    const { actor, field } = await setup();
    const other = await session(`draft-reader-${crypto.randomUUID()}@example.com`);
    const composition = root();
    const draft = await successful(await createRecordDraftsPostHandler(composition)(request("/api/crm/record-drafts", actor.cookie, "POST", { entity: "company" })));
    expect(await env.DB.prepare("SELECT id FROM company WHERE id=?").bind(draft.id).first()).toBeNull();
    const upload = (cookie: string) => {
      const original = uploadRequest(cookie, draft.id, field.id);
      const url = new URL(original.url); url.searchParams.set("draftId", draft.id);
      return new Request(url, original);
    };
    expect((await createFilesPostHandler(composition)(upload(other.cookie))).status).toBe(404);
    const file = await successful(await createFilesPostHandler(composition)(upload(actor.cookie)));
    expect((await createFileGetHandler(composition, file.id)(request("/file", other.cookie))).status).toBe(404);
    const downloaded = await createFileDownloadHandler(composition, file.id)(request("/download", actor.cookie));
    expect([...new Uint8Array(await downloaded.arrayBuffer())]).toEqual([0, 1, 2, 255]);
    await env.DB.prepare("UPDATE record_draft SET consumed_at=1 WHERE id=?").bind(draft.id).run();
    expect((await createFileGetHandler(composition, file.id)(request("/file", actor.cookie))).status).toBe(404);
    expect((await createFilesPostHandler(composition)(upload(actor.cookie))).status).toBe(404);
    const context = await requireRequestContext(new Headers({ cookie: actor.cookie }), composition);
    await expect(new DraftService(composition.db).prepareConsumption(context, "company", draft.id)).rejects.toMatchObject({ status: 409 });
    const expiredId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO record_draft(id,entity,user_id,expires_at,created_at) VALUES (?,'company',?,1,0)").bind(expiredId, actor.id).run();
    await expect(new DraftService(composition.db).prepareConsumption(context, "company", expiredId)).rejects.toMatchObject({ status: 409 });
    expect((await createFilesPostHandler(composition)(new Request(`https://auth.test/api/crm/files?entity=company&recordId=${expiredId}&draftId=${expiredId}&fieldId=${field.id}`, uploadRequest(actor.cookie, expiredId, field.id)))).status).toBe(404);
  });
  it("rejects draft finalization races for consumption, revocation, module and field changes", async () => {
    const { actor, field } = await setup(); const composition = root();
    const context = await requireRequestContext(new Headers({ cookie: actor.cookie }), composition);
    const drafts = new DraftService(composition.db);
    for (const race of ["consumption", "revoke", "module", "configuration"] as const) {
      const draft = await drafts.create(context, { entity: "company" }); let key = "";
      const bucket = new Proxy(bindings.CRM_FILES, { get(target, prop) {
        if (prop === "put") return async (k: string, bytes: Uint8Array) => {
          key = k; const result = await target.put(k, bytes);
          if (race === "consumption") await env.DB.prepare("UPDATE record_draft SET consumed_at=1 WHERE id=?").bind(draft.id).run();
          if (race === "revoke") await env.DB.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id=?").bind(actor.id).run();
          if (race === "module") await env.DB.prepare("UPDATE module_setting SET enabled=0 WHERE entity='company'").run();
          if (race === "configuration") await env.DB.prepare("UPDATE field_configuration_revision SET revision=revision+1 WHERE entity='company'").run();
          return result;
        };
        const value = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value;
      } });
      await expect(new FileService(composition.db, bucket).upload(context, { entity: "company", recordId: draft.id, draftId: draft.id, fieldId: field.id }, uploadRequest(actor.cookie, draft.id, field.id))).rejects.toMatchObject({ status: 409 });
      expect(await bindings.CRM_FILES.get(key)).toBeNull();
      await env.DB.prepare("UPDATE singleton_membership SET status='active' WHERE user_id=?").bind(actor.id).run();
      await env.DB.prepare("UPDATE module_setting SET enabled=1 WHERE entity='company'").run();
    }
  });
  it("round trips private bytes, safe names, ownership, attachment and archive access", async () => {
    const {actor,field,item} = await setup();
    const second = await session(`reader-${crypto.randomUUID()}@example.com`);
    const file = await successful(await createFilesPostHandler(root())(uploadRequest(actor.cookie,item.id,field.id)));
    expect(file).toMatchObject({name:"hợp đồng.txt",size:4}); expect(file.objectKey).toBeUndefined();
    const get = (cookie:string) => createFileGetHandler(root(),file.id)(request(`/api/crm/files/${file.id}`,cookie));
    expect((await get(second.cookie)).status).toBe(404);
    expect((await write(second.cookie,"company",item.id,{[field.key]:[file.id]})).status).toBe(409);
    await successful(await write(actor.cookie,"company",item.id,{[field.key]:[file.id]}));
    await successful(await get(second.cookie));
    const secondFile=await successful(await createFilesPostHandler(root())(uploadRequest(second.cookie,item.id,field.id)));
    await successful(await write(second.cookie,"company",item.id,{[field.key]:[secondFile.id,file.id]}));
    const wrongField=await successful(await create(actor.cookie,{entity:"company",label:"Other files",type:"file"}));
    expect((await write(actor.cookie,"company",item.id,{[wrongField.key]:[file.id]})).status).toBeGreaterThanOrEqual(400);
    const downloaded = await createFileDownloadHandler(root(),file.id)(request("/download",second.cookie));
    expect(downloaded.status).toBe(200); expect([...new Uint8Array(await downloaded.arrayBuffer())]).toEqual([0,1,2,255]);
    expect(downloaded.headers.get("content-type")).toBe("application/octet-stream");
    expect(downloaded.headers.get("content-disposition")).toContain("filename*=UTF-8''");
    expect(downloaded.headers.get("x-content-type-options")).toBe("nosniff");
    const other=await record(actor.cookie,"company",actor.id);
    expect((await write(actor.cookie,"company",other.id,{[field.key]:[file.id]})).status).toBeGreaterThanOrEqual(400);
    await successful(await patch(actor.cookie,field.id,{action:"archive"})); expect((await get(actor.cookie)).status).toBe(404);
    await successful(await patch(actor.cookie,field.id,{action:"restore"})); await successful(await get(actor.cookie));
    await successful(await write(actor.cookie,"company",item.id,{[field.key]:[]})); expect((await get(second.cookie)).status).toBe(404);
    expect((await write(second.cookie,"company",item.id,{[field.key]:[file.id]})).status).toBeGreaterThanOrEqual(400);
  });
  it("rejects origin, invalid names, missing authentication and actual oversize bodies",async()=>{
    const {actor,field,item}=await setup(); const post=createFilesPostHandler(root());
    expect((await post(uploadRequest(actor.cookie,item.id,field.id,undefined,undefined,"https://evil.test"))).status).toBe(403);
    expect((await post(uploadRequest("",item.id,field.id))).status).toBe(401);
    for(const name of ["../secret","bad\r\nheader","x".repeat(256)]) expect((await post(uploadRequest(actor.cookie,item.id,field.id,undefined,name))).status).toBe(400);
    expect((await post(uploadRequest(actor.cookie,item.id,field.id,new Uint8Array(10*1024*1024+1)))).status).toBe(413);
  });
  it("retains failed keys and repeatedly cleans tombstones including late bytes",async()=>{
    const {actor,field,item}=await setup();const composition=root();const context=await requireRequestContext(new Headers({cookie:actor.cookie}),composition);
    let key="";
    const bucket = new Proxy(bindings.CRM_FILES,{get(target,prop){if(prop==="put")return async(k:string,b:Uint8Array)=>{key=k;await target.put(k,b);throw new Error("storage acknowledgement lost");};if(prop==="delete")return async()=>{throw new Error("temporary deletion failure");};const value=Reflect.get(target,prop);return typeof value==="function"?value.bind(target):value;}});
    await expect(new FileService(composition.db,bucket).upload(context,{entity:"company",recordId:item.id,fieldId:field.id},uploadRequest(actor.cookie,item.id,field.id))).rejects.toMatchObject({status:409});
    expect(await bindings.CRM_FILES.get(key)).not.toBeNull();
    const failed=await env.DB.prepare("SELECT * FROM crm_file WHERE object_key=?").bind(key).first<any>();expect(failed.status).toBe("failed");
    // Create an already-old pending ledger through its supported insert contract.
    const oldId=crypto.randomUUID(),oldKey=crypto.randomUUID();
    await env.DB.prepare("INSERT INTO crm_file (id,object_key,entity,record_id,field_id,uploader_id,file_name,size,status,created_at) VALUES (?,?,'company',?,?,?,'old.txt',4,'pending',?)").bind(oldId,oldKey,item.id,field.id,actor.id,Date.now()-2*86_400_000).run();
    await bindings.CRM_FILES.put(oldKey,new Uint8Array([1,2,3,4]));
    await env.DB.prepare("UPDATE singleton_membership SET role='owner' WHERE user_id=?").bind(actor.id).run();
    await composition.files.cleanup(context);expect(await bindings.CRM_FILES.get(oldKey)).toBeNull();
    await bindings.CRM_FILES.put(oldKey,new Uint8Array([1]));await composition.files.cleanup(context);expect(await bindings.CRM_FILES.get(oldKey)).toBeNull();
    expect((await env.DB.prepare("SELECT status FROM crm_file WHERE id=?").bind(oldId).first<any>()).status).toBe("cleaning");
  });
  it("field configuration change during R2 put rejects finalization and compensates bytes",async()=>{
    const {actor,field,item}=await setup();const composition=root();const context=await requireRequestContext(new Headers({cookie:actor.cookie}),composition);let key="";
    const bucket=new Proxy(bindings.CRM_FILES,{get(target,prop){if(prop==="put")return async(k:string,b:Uint8Array)=>{key=k;const result=await target.put(k,b);await successful(await patch(actor.cookie,field.id,{action:"update",data:{label:"Changed files"}}));return result;};const value=Reflect.get(target,prop);return typeof value==="function"?value.bind(target):value;}});
    await expect(new FileService(composition.db,bucket).upload(context,{entity:"company",recordId:item.id,fieldId:field.id},uploadRequest(actor.cookie,item.id,field.id))).rejects.toMatchObject({status:409});expect(await bindings.CRM_FILES.get(key)).toBeNull();
  });
  it("revocation during real R2 put prevents ready finalization and compensates bytes",async()=>{
    const {actor,field,item}=await setup();const composition=root();const context=await requireRequestContext(new Headers({cookie:actor.cookie}),composition);let key="";
    const bucket=new Proxy(bindings.CRM_FILES,{get(target,prop){if(prop==="put")return async(k:string,b:Uint8Array)=>{key=k;const result=await target.put(k,b);await env.DB.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id=?").bind(actor.id).run();return result;};const value=Reflect.get(target,prop);return typeof value==="function"?value.bind(target):value;}});
    await expect(new FileService(composition.db,bucket).upload(context,{entity:"company",recordId:item.id,fieldId:field.id},uploadRequest(actor.cookie,item.id,field.id))).rejects.toMatchObject({status:409});expect(await bindings.CRM_FILES.get(key)).toBeNull();
    expect((await env.DB.prepare("SELECT status FROM singleton_membership WHERE user_id=?").bind(actor.id).first<any>()).status).toBe("revoked");
    expect((await env.DB.prepare("SELECT status FROM crm_file WHERE object_key=?").bind(key).first<any>()).status).toBe("failed");
  });
});
