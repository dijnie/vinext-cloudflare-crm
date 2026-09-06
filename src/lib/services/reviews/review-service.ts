import { and, desc, eq, isNull, isNotNull, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { company, contact, review } from "@/lib/db/schema";
import type { RequestContext } from "@/lib/http/request-context";
import { HttpError } from "@/lib/http/http-errors";
import {
  actionGuard,
  permissionError,
  permissionPredicate,
  requirePermission,
} from "../permissions/permission-policy";
import { requireModulesEnabled } from "../modules/module-policy";
import {
  reviewCreateInputSchema,
  reviewListOutputSchema,
  reviewRowSchema,
  reviewUpdateInputSchema,
  type ReviewCreateInput,
  type ReviewUpdateInput,
} from "./review-contracts";
const norm = (tags: string[]) =>
  [
    ...new Set(tags.map((x) => x.trim().toLocaleLowerCase()).filter(Boolean)),
  ].sort();
const canonical = (x: unknown) =>
  JSON.stringify(x, Object.keys(x as object).sort());
async function fingerprint(x: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(canonical(x)),
      ),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
function row(r: typeof review.$inferSelect) {
  return reviewRowSchema.parse({
    ...r,
    tags: JSON.parse(r.tagsJson),
    archivedAt: r.archivedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  });
}
export class ReviewService {
  constructor(private readonly db: AppDatabase) {}
  async list(context: RequestContext, archived = false) {
    await requirePermission(this.db, context);
    const rows = await this.db
      .select()
      .from(review)
      .where(
        and(
          permissionPredicate(context),
          archived ? isNotNull(review.archivedAt) : isNull(review.archivedAt),
        ),
      )
      .orderBy(desc(review.createdAt), desc(review.id))
      .limit(200);
    return reviewListOutputSchema.parse({ rows: rows.map(row) });
  }
  async byId(context: RequestContext, id: string) {
    await requirePermission(this.db, context);
    const found = await this.db
      .select()
      .from(review)
      .where(and(eq(review.id, id), permissionPredicate(context)))
      .get();
    if (!found) throw new HttpError(404, "not_found", "Review was not found");
    return row(found);
  }
  async create(context: RequestContext, raw: ReviewCreateInput) {
    const input = reviewCreateInputSchema.parse(raw);
    await requirePermission(this.db, context, ["review.create"]);
    await requireModulesEnabled(this.db, ["review"]);
    const tags = norm(input.tags),
      fp = await fingerprint({ ...input, tags });
    const existing = await this.db
      .select()
      .from(review)
      .where(
        and(eq(review.source, input.source), eq(review.eventId, input.eventId)),
      )
      .get();
    if (existing) {
      if (existing.fingerprint !== fp)
        throw new HttpError(409, "conflict", "Review event was already used");
      return row(existing);
    }
    const related = input.companyId
      ? await this.db
          .select()
          .from(company)
          .where(
            and(eq(company.id, input.companyId), isNull(company.archivedAt)),
          )
          .get()
      : await this.db
          .select()
          .from(contact)
          .where(
            and(eq(contact.id, input.contactId!), isNull(contact.archivedAt)),
          )
          .get();
    if (!related)
      throw new HttpError(
        400,
        "validation_failed",
        "Choose an active customer",
      );
    const now = new Date(),
      values = {
        id: crypto.randomUUID(),
        source: input.source,
        eventId: input.eventId,
        companyId: input.companyId ?? null,
        contactId: input.contactId ?? null,
        content: input.content,
        rating: input.rating,
        tagsJson: JSON.stringify(tags),
        creatorUserId: context.userId,
        fingerprint: fp,
        revision: 0,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
    const guard = actionGuard(this.db, context, ["review.create"]);
    try {
      await this.db.batch([
        guard.begin,
        this.db.insert(review).values(values),
        guard.end,
      ]);
    } catch (e) {
      const replay = await this.db
        .select()
        .from(review)
        .where(
          and(
            eq(review.source, input.source),
            eq(review.eventId, input.eventId),
          ),
        )
        .get();
      if (replay && replay.fingerprint === fp) return row(replay);
      permissionError(e);
    }
    return row(values);
  }
  async update(context: RequestContext, id: string, raw: ReviewUpdateInput) {
    const input = reviewUpdateInputSchema.parse(raw);
    const permission =
      input.archived === undefined
        ? "review.update"
        : input.archived
          ? "review.archive"
          : "review.restore";
    await requirePermission(this.db, context, [permission]);
    await requireModulesEnabled(this.db, ["review"]);
    const guard = actionGuard(this.db, context, [permission]);
    try {
      const [, rows] = await this.db.batch([
        guard.begin,
        this.db
          .update(review)
          .set({
            ...(input.content !== undefined ? { content: input.content } : {}),
            ...(input.rating !== undefined ? { rating: input.rating } : {}),
            ...(input.tags !== undefined
              ? { tagsJson: JSON.stringify(norm(input.tags)) }
              : {}),
            ...(input.archived !== undefined
              ? { archivedAt: input.archived ? new Date() : null }
              : {}),
            revision: sql`${review.revision}+1`,
            updatedAt: new Date(),
          })
          .where(
            and(eq(review.id, id), eq(review.revision, input.expectedRevision)),
          )
          .returning(),
        guard.end,
      ]);
      if (!rows[0])
        throw new HttpError(
          409,
          "conflict",
          "Review changed; reload before saving",
        );
      return row(rows[0]);
    } catch (e) {
      permissionError(e);
    }
  }
}
