import { and, eq, isNull, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { contract, contractDocument } from "@/lib/db/schema";
import type { RequestContext } from "@/lib/http/request-context";
import { HttpError } from "@/lib/http/http-errors";
import {
  actionGuard,
  permissionPredicate,
  requirePermission,
} from "../permissions/permission-policy";
import { readUploadBody, uploadFileName } from "../files/file-upload-body";
import { storageWriteError } from "../files/storage-write-policy";
const meta = (x: typeof contractDocument.$inferSelect) => ({
  id: x.id,
  name: x.fileName,
  size: x.size,
  uploadedAt: (x.readyAt ?? x.createdAt).toISOString(),
});
export class ContractDocumentService {
  constructor(
    private readonly db: AppDatabase,
    private readonly bucket: R2Bucket,
  ) {}
  private async accessible(context: RequestContext, id: string) {
    await requirePermission(this.db, context);
    const row = await this.db
      .select()
      .from(contractDocument)
      .where(
        and(
          eq(contractDocument.id, id),
          eq(contractDocument.status, "ready"),
          permissionPredicate(context),
        ),
      )
      .get();
    if (!row)
      throw new HttpError(404, "not_found", "Contract document is unavailable");
    return row;
  }
  async upload(context: RequestContext, contractId: string, request: Request) {
    await requirePermission(this.db, context, ["contract.document"]);
    const parent = await this.db
      .select({ id: contract.id, revision: contract.revision })
      .from(contract)
      .where(
        and(
          eq(contract.id, contractId),
          isNull(contract.archivedAt),
          permissionPredicate(context),
        ),
      )
      .get();
    if (!parent)
      throw new HttpError(404, "not_found", "Contract was not found");
    const bytes = await readUploadBody(request),
      id = crypto.randomUUID(),
      objectKey = crypto.randomUUID(),
      createdAt = new Date(),
      fileName = uploadFileName(request),
      guard = actionGuard(
        this.db,
        context,
        ["contract.document"],
        false,
        sql`exists(select 1 from contract where id=${contractId} and revision=${parent.revision} and archived_at is null)`,
      );
    try {
      await this.db.batch([
        guard.begin,
        this.db.insert(contractDocument).values({
          id,
          contractId,
          objectKey,
          fileName,
          size: bytes.byteLength,
          status: "pending",
          uploaderId: context.userId,
          createdAt,
        }),
        guard.end,
      ]);
    } catch (e) {
      storageWriteError(e);
    }
    try {
      await this.bucket.put(objectKey, bytes, {
        httpMetadata: { contentType: "application/octet-stream" },
      });
      const final = actionGuard(
        this.db,
        context,
        ["contract.document"],
        false,
        sql`exists(select 1 from contract where id=${contractId} and revision=${parent.revision} and archived_at is null)`,
      );
      const [, rows] = await this.db.batch([
        final.begin,
        this.db
          .update(contractDocument)
          .set({ status: "ready", readyAt: new Date() })
          .where(
            and(
              eq(contractDocument.id, id),
              eq(contractDocument.status, "pending"),
            ),
          )
          .returning(),
        final.end,
      ]);
      if (!rows[0]) throw new Error("document_finalize_conflict");
      return meta(rows[0]);
    } catch (e) {
      await this.db
        .update(contractDocument)
        .set({ status: "failed" })
        .where(
          and(
            eq(contractDocument.id, id),
            eq(contractDocument.status, "pending"),
          ),
        );
      const state = await this.db
        .select()
        .from(contractDocument)
        .where(eq(contractDocument.id, id))
        .get();
      if (state?.status !== "ready")
        try {
          await this.bucket.delete(objectKey);
        } catch {}
      throw new HttpError(
        409,
        "conflict",
        "Contract document upload could not be finalized",
      );
    }
  }
  async download(context: RequestContext, id: string) {
    const row = await this.accessible(context, id),
      object = await this.bucket.get(row.objectKey);
    if (!object)
      throw new HttpError(
        404,
        "not_found",
        "Contract document bytes are unavailable",
      );
    await this.accessible(context, id);
    const name = encodeURIComponent(row.fileName);
    return new Response(object.body, {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(object.size),
        "content-disposition": `attachment; filename*=UTF-8''${name}`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  }
  async cleanup(context: RequestContext) {
    await requirePermission(this.db, context, [], true);
    const cutoff = Date.now() - 86_400_000,
      rows = await this.db
        .select()
        .from(contractDocument)
        .where(
          sql`${contractDocument.status}='cleaning' OR (${contractDocument.status} IN ('pending','failed') AND ${contractDocument.createdAt}<${cutoff})`,
        )
        .orderBy(
          sql`coalesce(${contractDocument.cleanupAttemptedAt},0)`,
          contractDocument.createdAt,
          contractDocument.id,
        )
        .limit(20);
    let cleaned = 0,
      failed = 0;
    for (const row of rows) {
      const guard = actionGuard(this.db, context, [], true);
      const [, claimed] = await this.db.batch([
        guard.begin,
        this.db
          .update(contractDocument)
          .set({ status: "cleaning", cleanupAttemptedAt: new Date() })
          .where(
            and(
              eq(contractDocument.id, row.id),
              sql`${contractDocument.status}='cleaning' OR (${contractDocument.status} IN ('pending','failed') AND ${contractDocument.createdAt}<${cutoff})`,
            ),
          )
          .returning(),
        guard.end,
      ]);
      if (!claimed.length) continue;
      try {
        await this.bucket.delete(row.objectKey);
        cleaned++;
      } catch {
        failed++;
      }
    }
    return { cleaned, failed };
  }
}
