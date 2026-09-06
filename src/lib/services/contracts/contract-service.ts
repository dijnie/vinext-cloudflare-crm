import { and, desc, eq, isNull, isNotNull, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import {
  company,
  contact,
  contract,
  contractDocument,
  contractOperation,
  contractParty,
  contractVersion,
  deal,
  operationConditionGuard,
  salesOrder,
  singletonMembership,
} from "@/lib/db/schema";
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
  contractCommandInputSchema,
  contractCreateInputSchema,
  contractDetailSchema,
  contractListInputSchema,
  contractListOutputSchema,
  type ContractCommandInput,
  type ContractCreateInput,
} from "./contract-contracts";
const canonical = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canonical)}]`
    : v && typeof v === "object"
      ? `{${Object.entries(v)
          .filter(([, x]) => x !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`)
          .join(",")}}`
      : JSON.stringify(v);
async function digest(v: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(canonical(v)),
      ),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
function dates<T extends typeof contract.$inferSelect>(r: T) {
  return {
    ...r,
    effectiveAt: r.effectiveAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    archivedAt: r.archivedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
function contractError(error: unknown): never {
  let current: unknown = error;
  while (current && typeof current === "object") {
    if (current instanceof HttpError) throw current;
    if (current instanceof Error) {
      if (current.message.includes("action_permission_required"))
        permissionError(error);
      if (
        current.message.includes("operation_conflict") ||
        current.message.includes("contract_version.contract_id") ||
        current.message.includes("contract_operation.operation_key")
      )
        throw new HttpError(
          409,
          "conflict",
          "Contract changed; reload before saving",
        );
      if (
        current.message.includes("FOREIGN KEY constraint failed") ||
        current.message.includes("CHECK constraint failed") ||
        current.message.includes("contract_relations_invalid") ||
        current.message.includes("contract_party_invalid")
      )
        throw new HttpError(
          400,
          "validation_failed",
          "Contract relationships are no longer valid",
        );
    }
    current = "cause" in current ? current.cause : null;
  }
  throw error;
}
export class ContractService {
  constructor(private readonly db: AppDatabase) {}
  async list(context: RequestContext, raw: unknown) {
    await requirePermission(this.db, context);
    const input = contractListInputSchema.parse(raw);
    const rows = await this.db
      .select()
      .from(contract)
      .where(
        and(
          permissionPredicate(context),
          input.archived
            ? isNotNull(contract.archivedAt)
            : isNull(contract.archivedAt),
          input.status === "all"
            ? undefined
            : eq(contract.status, input.status),
        ),
      )
      .orderBy(desc(contract.updatedAt), desc(contract.id))
      .limit(input.limit);
    return contractListOutputSchema.parse({ rows: rows.map(dates) });
  }
  async byId(context: RequestContext, id: string) {
    await requirePermission(this.db, context);
    const row = await this.db
      .select()
      .from(contract)
      .where(and(eq(contract.id, id), permissionPredicate(context)))
      .get();
    if (!row) throw new HttpError(404, "not_found", "Contract was not found");
    const [parties, versions, documents] = await Promise.all([
      this.db
        .select()
        .from(contractParty)
        .where(eq(contractParty.contractId, id)),
      this.db
        .select({
          version: contractVersion.version,
          reason: contractVersion.reason,
          actorId: contractVersion.actorId,
          createdAt: contractVersion.createdAt,
        })
        .from(contractVersion)
        .where(eq(contractVersion.contractId, id))
        .orderBy(desc(contractVersion.version)),
      this.db
        .select()
        .from(contractDocument)
        .where(
          and(
            eq(contractDocument.contractId, id),
            eq(contractDocument.status, "ready"),
          ),
        )
        .orderBy(desc(contractDocument.createdAt)),
    ]);
    return contractDetailSchema.parse({
      ...dates(row),
      parties,
      versions: versions.map((v) => ({
        ...v,
        createdAt: v.createdAt.toISOString(),
      })),
      documents: documents.map((d) => ({
        id: d.id,
        name: d.fileName,
        size: d.size,
        uploadedAt: (d.readyAt ?? d.createdAt).toISOString(),
      })),
    });
  }
  private async replay(
    context: RequestContext,
    key: string,
    fingerprint: string,
  ) {
    const row = await this.db
      .select()
      .from(contractOperation)
      .where(
        and(
          eq(contractOperation.operationKey, key),
          permissionPredicate(context),
        ),
      )
      .get();
    if (!row) return null;
    if (row.fingerprint !== fingerprint)
      throw new HttpError(409, "conflict", "Operation key was already used");
    return JSON.parse(row.resultJson) as { id: string };
  }
  private async relations(input: {
    companyId: string;
    contactId?: string | null;
    dealId?: string | null;
    orderId?: string | null;
    ownerMembershipId: string;
    effectiveAt?: string | Date | null;
    expiresAt?: string | Date | null;
    parties: { companyId?: string; contactId?: string }[];
  }) {
    const [c, m, ct, d, o] = await Promise.all([
      this.db
        .select()
        .from(company)
        .where(and(eq(company.id, input.companyId), isNull(company.archivedAt)))
        .get(),
      this.db
        .select()
        .from(singletonMembership)
        .where(
          and(
            eq(singletonMembership.userId, input.ownerMembershipId),
            eq(singletonMembership.status, "active"),
          ),
        )
        .get(),
      input.contactId
        ? this.db
            .select()
            .from(contact)
            .where(
              and(eq(contact.id, input.contactId), isNull(contact.archivedAt)),
            )
            .get()
        : null,
      input.dealId
        ? this.db.select().from(deal).where(eq(deal.id, input.dealId)).get()
        : null,
      input.orderId
        ? this.db
            .select()
            .from(salesOrder)
            .where(eq(salesOrder.id, input.orderId))
            .get()
        : null,
    ]);
    if (!c || !m)
      throw new HttpError(
        400,
        "validation_failed",
        "Choose an active company and owner",
      );
    if (
      (ct && ct.companyId !== input.companyId) ||
      (input.contactId && !ct) ||
      (d && d.companyId !== input.companyId) ||
      (input.dealId && !d) ||
      (o && o.companyId && o.companyId !== input.companyId) ||
      (input.orderId && !o)
    )
      throw new HttpError(
        400,
        "validation_failed",
        "Contract relationships must belong to the same company",
      );
    if (!input.parties.some((p) => p.companyId))
      throw new HttpError(
        400,
        "validation_failed",
        "At least one company party is required",
      );
    const effective = input.effectiveAt
        ? new Date(input.effectiveAt).getTime()
        : null,
      expires = input.expiresAt ? new Date(input.expiresAt).getTime() : null;
    if (effective !== null && expires !== null && expires < effective)
      throw new HttpError(
        400,
        "validation_failed",
        "Expiry must not precede effective date",
      );
  }
  private snapshot(input: Record<string, unknown>) {
    return JSON.stringify(input);
  }
  async create(context: RequestContext, raw: ContractCreateInput) {
    const input = contractCreateInputSchema.parse(raw);
    await requirePermission(this.db, context, [
      "contract.create",
      "contract.assign",
    ]);
    await requireModulesEnabled(this.db, ["contract"]);
    const fp = await digest(input),
      old = await this.replay(context, input.operationKey, fp);
    if (old) return this.byId(context, old.id);
    await this.relations(input);
    const id = crypto.randomUUID(),
      now = new Date(),
      row = {
        id,
        name: input.name,
        companyId: input.companyId,
        contactId: input.contactId ?? null,
        dealId: input.dealId ?? null,
        orderId: input.orderId ?? null,
        valueMinor: input.valueMinor ?? null,
        currency: input.currency,
        effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        ownerMembershipId: input.ownerMembershipId,
        creatorUserId: context.userId,
        status: "draft" as const,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      };
    const result = { id };
    const guard = actionGuard(this.db, context, [
      "contract.create",
      "contract.assign",
    ]);
    try {
      await this.db.batch([
        guard.begin,
        this.db.insert(contract).values(row),
        ...input.parties.map((p, i) =>
          this.db.insert(contractParty).values({
            contractId: id,
            partyId: String(i + 1),
            companyId: p.companyId ?? null,
            contactId: p.contactId ?? null,
            role: p.role,
            createdAt: now,
          }),
        ),
        this.db.insert(contractVersion).values({
          contractId: id,
          version: 0,
          snapshotJson: this.snapshot({ ...row, parties: input.parties }),
          reason: "created",
          actorId: context.userId,
          createdAt: now,
        }),
        this.db.insert(contractOperation).values({
          operationKey: input.operationKey,
          contractId: id,
          fingerprint: fp,
          resultJson: JSON.stringify(result),
          actorId: context.userId,
          createdAt: now,
        }),
        guard.end,
      ]);
    } catch (e) {
      const replay = await this.replay(context, input.operationKey, fp);
      if (replay) return this.byId(context, replay.id);
      contractError(e);
    }
    return this.byId(context, id);
  }
  async command(
    context: RequestContext,
    id: string,
    raw: ContractCommandInput,
  ) {
    const input = contractCommandInputSchema.parse(raw),
      assign =
        input.action === "update" && input.ownerMembershipId !== undefined,
      permission =
        input.action === "archive"
          ? ("contract.archive" as const)
          : input.action === "restore"
            ? ("contract.restore" as const)
            : ("contract.update" as const);
    await requirePermission(this.db, context, [
      permission,
      ...(assign ? ["contract.assign" as const] : []),
    ]);
    await requireModulesEnabled(this.db, ["contract"]);
    const fp = await digest({ id, ...input }),
      old = await this.replay(context, input.operationKey, fp);
    if (old) return this.byId(context, old.id);
    const current = await this.db
      .select()
      .from(contract)
      .where(eq(contract.id, id))
      .get();
    if (!current)
      throw new HttpError(404, "not_found", "Contract was not found");
    if (current.revision !== input.expectedRevision)
      throw new HttpError(
        409,
        "conflict",
        "Contract changed; reload before saving",
      );
    if (current.archivedAt && input.action !== "restore")
      throw new HttpError(
        409,
        "conflict",
        "Restore the contract before changing it",
      );
    if (!current.archivedAt && input.action === "restore")
      throw new HttpError(
        409,
        "conflict",
        "Contract is already active in the workspace",
      );
    if (input.action === "status") {
      const allowed: Record<
        typeof current.status,
        readonly (typeof current.status)[]
      > = {
        draft: ["active", "terminated"],
        active: ["completed", "terminated", "expired"],
        completed: [],
        terminated: [],
        expired: [],
      };
      if (!allowed[current.status].includes(input.status))
        throw new HttpError(
          409,
          "conflict",
          "Contract status transition is not allowed",
        );
    }
    if (input.action === "archive" && current.status === "active")
      throw new HttpError(
        409,
        "conflict",
        "End an active contract before archiving it",
      );
    const merged =
      input.action === "update"
        ? {
            ...current,
            ...input,
            parties:
              input.parties ??
              (
                await this.db
                  .select()
                  .from(contractParty)
                  .where(eq(contractParty.contractId, id))
              ).map((p) => ({
                companyId: p.companyId ?? undefined,
                contactId: p.contactId ?? undefined,
                role: p.role,
              })),
          }
        : {
            ...current,
            parties: (
              await this.db
                .select()
                .from(contractParty)
                .where(eq(contractParty.contractId, id))
            ).map((p) => ({
              companyId: p.companyId ?? undefined,
              contactId: p.contactId ?? undefined,
              role: p.role,
            })),
          };
    await this.relations(merged);
    const now = new Date(),
      nextRevision = current.revision + 1;
    const values =
      input.action === "update"
        ? {
            name: input.name ?? current.name,
            companyId: input.companyId ?? current.companyId,
            contactId:
              input.contactId === undefined
                ? current.contactId
                : input.contactId,
            dealId: input.dealId === undefined ? current.dealId : input.dealId,
            orderId:
              input.orderId === undefined ? current.orderId : input.orderId,
            valueMinor:
              input.valueMinor === undefined
                ? current.valueMinor
                : input.valueMinor,
            currency: input.currency ?? current.currency,
            effectiveAt:
              input.effectiveAt === undefined
                ? current.effectiveAt
                : input.effectiveAt
                  ? new Date(input.effectiveAt)
                  : null,
            expiresAt:
              input.expiresAt === undefined
                ? current.expiresAt
                : input.expiresAt
                  ? new Date(input.expiresAt)
                  : null,
            ownerMembershipId:
              input.ownerMembershipId ?? current.ownerMembershipId,
          }
        : {
            ...(input.action === "status" ? { status: input.status } : {}),
            ...(input.action === "archive" ? { archivedAt: now } : {}),
            ...(input.action === "restore" ? { archivedAt: null } : {}),
          };
    const result = { id };
    const guard = actionGuard(this.db, context, [
      permission,
      ...(assign ? ["contract.assign" as const] : []),
    ]);
    const conditionId = crypto.randomUUID();
    try {
      await this.db.batch([
        guard.begin,
        this.db.insert(operationConditionGuard).values({
          id: conditionId,
          authorized: sql<number>`CASE WHEN EXISTS (
            SELECT 1 FROM contract
             WHERE id = ${id} AND revision = ${input.expectedRevision}
          ) THEN 1 ELSE 0 END`,
        }),
        this.db
          .update(contract)
          .set({ ...values, revision: nextRevision, updatedAt: now })
          .where(
            and(
              eq(contract.id, id),
              eq(contract.revision, input.expectedRevision),
            ),
          ),
        ...(input.action === "update" && input.parties
          ? [
              this.db
                .delete(contractParty)
                .where(eq(contractParty.contractId, id)),
              ...input.parties.map((p, i) =>
                this.db.insert(contractParty).values({
                  contractId: id,
                  partyId: String(i + 1),
                  companyId: p.companyId ?? null,
                  contactId: p.contactId ?? null,
                  role: p.role,
                  createdAt: now,
                }),
              ),
            ]
          : []),
        this.db.insert(contractVersion).values({
          contractId: id,
          version: nextRevision,
          snapshotJson: this.snapshot({
            ...merged,
            ...values,
            revision: nextRevision,
          }),
          reason: input.reason,
          actorId: context.userId,
          createdAt: now,
        }),
        this.db.insert(contractOperation).values({
          operationKey: input.operationKey,
          contractId: id,
          fingerprint: fp,
          resultJson: JSON.stringify(result),
          actorId: context.userId,
          createdAt: now,
        }),
        this.db
          .delete(operationConditionGuard)
          .where(eq(operationConditionGuard.id, conditionId)),
        guard.end,
      ]);
    } catch (e) {
      const replay = await this.replay(context, input.operationKey, fp);
      if (replay) return this.byId(context, replay.id);
      contractError(e);
    }
    return this.byId(context, id);
  }
}
