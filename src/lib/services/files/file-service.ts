import { and, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { crmFile } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-errors";
import type { RequestContext } from "@/lib/http/request-context";
import { actionGuard, authorizedWrite, permissionPredicate, requirePermission } from "../permissions/permission-policy";
import type { FileUploadInput } from "./file-contracts";
import { readUploadBody, uploadFileName } from "./file-upload-body";

function anchors(input: FileUploadInput) {
  // Entity names are validated before this helper; SQL identifiers never come from request strings.
  const table = input.entity === "company" ? sql`company` : input.entity === "contact" ? sql`contact` : sql`deal`;
  return sql`EXISTS (SELECT 1 FROM custom_field_definition WHERE id=${input.fieldId} AND entity=${input.entity} AND type='file' AND archived_at IS NULL AND deleted_at IS NULL) AND EXISTS (SELECT 1 FROM ${table} WHERE id=${input.recordId})`;
}
function metadata(row: typeof crmFile.$inferSelect) { return { id: row.id, name: row.fileName, size: row.size, uploadedAt: (row.readyAt ?? row.createdAt).toISOString() }; }
export class FileService {
  constructor(private readonly db: AppDatabase, private readonly bucket: R2Bucket) {}
  async upload(context: RequestContext, input: FileUploadInput, request: Request) {
    const permissions = [`${input.entity}.update` as const];
    await requirePermission(this.db, context, permissions);
    const snapshot = await this.db.get<{ revision: number }>(sql`SELECT revision FROM field_configuration_revision WHERE entity=${input.entity} AND (${anchors(input)})`);
    if (!snapshot) throw new HttpError(404, "not_found", "Record or file field is unavailable");
    const fileName = uploadFileName(request), bytes = await readUploadBody(request);
    const id = crypto.randomUUID(), objectKey = crypto.randomUUID(), createdAt = new Date();
    await authorizedWrite(this.db, context, permissions, this.db.insert(crmFile).values({ id, objectKey, ...input, uploaderId: context.userId, fileName, size: bytes.byteLength, status: "pending", createdAt }));
    try {
      await this.bucket.put(objectKey, bytes, { httpMetadata: { contentType: "application/octet-stream" } });
      const guard = actionGuard(this.db, context, permissions, false, sql`(${anchors(input)}) AND EXISTS (SELECT 1 FROM field_configuration_revision WHERE entity=${input.entity} AND revision=${snapshot.revision})`);
      const [, rows] = await this.db.batch([guard.begin, this.db.update(crmFile).set({ status: "ready", readyAt: new Date() }).where(and(eq(crmFile.id, id), eq(crmFile.status, "pending"))).returning(), guard.end]);
      if (!rows[0]) throw new HttpError(409, "conflict", "Upload was claimed for cleanup");
      return metadata(rows[0]);
    } catch (error) {
      // Only an acknowledged non-ready state permits compensation. An ambiguous DB
      // response after committing ready must never destroy an available attachment.
      await this.db.update(crmFile).set({ status: "failed" }).where(and(eq(crmFile.id, id), eq(crmFile.status, "pending")));
      const state = await this.db.select({ status: crmFile.status }).from(crmFile).where(eq(crmFile.id, id)).get();
      if (state && state.status !== "ready") { try { await this.bucket.delete(objectKey); } catch { /* The permanent ledger retains this key for owner cleanup. */ } }
      if (error instanceof HttpError) throw error;
      throw new HttpError(409, "conflict", "File upload could not be finalized");
    }
  }
  private async accessible(context: RequestContext, id: string) {
    await requirePermission(this.db, context);
    const row = await this.db.select().from(crmFile).where(and(eq(crmFile.id, id), eq(crmFile.status, "ready"))).get();
    if (!row) throw new HttpError(404, "not_found", "File is unavailable");
    const column = row.entity === "company" ? sql`company_id` : row.entity === "contact" ? sql`contact_id` : sql`deal_id`;
    const allowed = await this.db.get<{ allowed: number }>(sql`SELECT (${permissionPredicate(context)}) AND (${anchors(row)}) AND (${row.uploaderId}=${context.userId} OR EXISTS (SELECT 1 FROM custom_field_value v, json_each(v.json_value) j WHERE v.field_id=${row.fieldId} AND v.${column}=${row.recordId} AND j.value=${row.id})) AS allowed`);
    if (!allowed?.allowed) throw new HttpError(404, "not_found", "File is unavailable");
    return row;
  }
  async metadata(context: RequestContext, id: string) { return metadata(await this.accessible(context, id)); }
  async download(context: RequestContext, id: string) {
    const row = await this.accessible(context, id);
    const object = await this.bucket.get(row.objectKey);
    if (!object) throw new HttpError(404, "not_found", "File bytes are unavailable");
    // Recheck access after storage I/O so revocation during the read is respected.
    await this.accessible(context, id);
    const name = encodeURIComponent(row.fileName).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(object.body, { headers: { "content-type": "application/octet-stream", "content-length": String(object.size), "content-disposition": `attachment; filename="download"; filename*=UTF-8''${name}`, "x-content-type-options": "nosniff", "cache-control": "private, no-store" } });
  }
  async cleanup(context: RequestContext) {
    await requirePermission(this.db, context, [], true);
    const cutoff = Date.now() - 86_400_000;
    const rows = await this.db.select().from(crmFile).where(sql`${crmFile.status}='cleaning' OR (${crmFile.status} IN ('pending','failed') AND ${crmFile.createdAt}<${cutoff})`).orderBy(sql`coalesce(${crmFile.cleanupAttemptedAt},0)`, crmFile.createdAt, crmFile.id).limit(20);
    let cleaned = 0, failed = 0;
    for (const row of rows) {
      const guard = actionGuard(this.db, context, [], true);
      const [, claimed] = await this.db.batch([guard.begin, this.db.update(crmFile).set({ status: "cleaning", cleanupAttemptedAt: new Date() }).where(and(eq(crmFile.id, row.id), sql`${crmFile.status}='cleaning' OR (${crmFile.status} IN ('pending','failed') AND ${crmFile.createdAt}<${cutoff})`)).returning(), guard.end]);
      if (!claimed.length) continue;
      try { await this.bucket.delete(row.objectKey); cleaned++; } catch { failed++; }
    }
    return { cleaned, failed };
  }
}
