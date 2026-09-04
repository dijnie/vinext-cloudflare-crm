import { inJsonArray } from "@/crm/sql-filters";
import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  like,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import { listFacets } from "@/crm/facet-repository";
import {
  company,
  contact,
  deal,
  dealContact,
  dealStage,
  singletonMembership,
  user,
} from "@/db/schema";
import type { DealListInput } from "@/crm/contracts/deal-contract";

export class DealRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(input: DealListInput) {
    const where = this.where(input);
    const rows = await this.db
      .select({
        id: deal.id,
        name: deal.name,
        description: deal.description,
        companyId: deal.companyId,
        companyName: company.name,
        companyDomain: company.domain,
        ownerMembershipId: deal.ownerMembershipId,
        ownerName: user.name,
        ownerEmail: user.email,
        stageId: deal.stageId,
        stageLabelKey: dealStage.labelKey,
        closedState: dealStage.closedState,
        amountMinor: deal.amountMinor,
        currency: deal.currency,
        expectedCloseAt: deal.expectedCloseAt,
        closedAt: deal.closedAt,
        closedReason: deal.closedReason,
        lastActivityAt: deal.lastActivityAt,
        archivedAt: deal.archivedAt,
        createdAt: deal.createdAt,
        updatedAt: deal.updatedAt,
      })
      .from(deal)
      .innerJoin(company, eq(company.id, deal.companyId))
      .innerJoin(dealStage, eq(dealStage.id, deal.stageId))
      .innerJoin(user, eq(user.id, deal.ownerMembershipId))
      .where(where)
      .orderBy(this.order(input.sort, input.dir), asc(deal.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)` })
      .from(deal)
      .where(where);
    const facets = await listFacets(this.db, "deal", this.where({ ...input, owner: [], company: [], stage: [] }));
    return { rows, total, facets };
  }

  async byId(id: string) {
    const record = await this.db
      .select({
        id: deal.id,
        name: deal.name,
        description: deal.description,
        companyId: deal.companyId,
        companyName: company.name,
        companyDomain: company.domain,
        ownerMembershipId: deal.ownerMembershipId,
        ownerName: user.name,
        ownerEmail: user.email,
        stageId: deal.stageId,
        stageLabelKey: dealStage.labelKey,
        closedState: dealStage.closedState,
        stageChangedAt: deal.stageChangedAt,
        amountMinor: deal.amountMinor,
        currency: deal.currency,
        expectedCloseAt: deal.expectedCloseAt,
        closedAt: deal.closedAt,
        closedReason: deal.closedReason,
        lastActivityAt: deal.lastActivityAt,
        archivedAt: deal.archivedAt,
        createdAt: deal.createdAt,
        updatedAt: deal.updatedAt,
      })
      .from(deal)
      .innerJoin(company, eq(company.id, deal.companyId))
      .innerJoin(dealStage, eq(dealStage.id, deal.stageId))
      .innerJoin(user, eq(user.id, deal.ownerMembershipId))
      .where(eq(deal.id, id))
      .get();
    if (!record) return null;
    const contacts = await this.db
      .select({
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        title: contact.title,
        role: dealContact.role,
      })
      .from(dealContact)
      .innerJoin(contact, eq(contact.id, dealContact.contactId))
      .where(eq(dealContact.dealId, id))
      .orderBy(asc(contact.firstName), asc(contact.lastName), asc(contact.id));
    return { ...record, contacts };
  }

  create(values: typeof deal.$inferInsert) {
    return this.db.insert(deal).values(values).returning().get();
  }
  async updateWithHistory(id: string, values: Partial<typeof deal.$inferInsert>, expectedStage: string, authorId: string) {
    const changedStage = values.stageId !== undefined && values.stageId !== expectedStage;
    const now = values.updatedAt ?? new Date();
    const query = this.db.update(deal).set({
      ...values,
      ...(changedStage ? { lastActivityAt: sql`max(coalesce(${deal.lastActivityAt}, 0), ${now.getTime()})` } : {}),
    }).where(and(eq(deal.id, id), eq(deal.stageId, expectedStage))).returning({ id: deal.id, name: deal.name }).toSQL();
    const update = this.db.$client.prepare(query.sql).bind(...query.params);
    if (!changedStage) {
      const result = await update.all<{ id: string; name: string }>();
      return result.results[0];
    }
    const auditId = crypto.randomUUID();
    // changes() refers to the preceding guarded UPDATE on the same batch connection.
    // A stale stage therefore produces neither history nor related-record stamps.
    const result = await this.db.$client.batch([
      update,
      this.db.$client.prepare(`INSERT INTO activity
        (id, type, company_id, deal_id, author_user_id, metadata_json, occurred_at, created_at, updated_at)
        SELECT ?, 'stage_change', company_id, id, ?, json_object('fromStageId', ?, 'toStageId', ?), ?, ?, ?
        FROM deal WHERE id = ? AND changes() = 1`)
        .bind(auditId, authorId, expectedStage, values.stageId, now.getTime(), now.getTime(), now.getTime(), id),
      this.db.$client.prepare(`UPDATE company SET last_activity_at = max(coalesce(last_activity_at, 0), ?), updated_at = ?
        WHERE id = (SELECT company_id FROM activity WHERE id = ?)`)
        .bind(now.getTime(), now.getTime(), auditId),
    ]);
    return result[0]!.results[0] as { id: string; name: string } | undefined;
  }
  archive(id: string, archivedAt: Date | null) {
    return this.db
      .update(deal)
      .set({ archivedAt, updatedAt: new Date() })
      .where(eq(deal.id, id))
      .returning()
      .get();
  }
  async bulkArchive(ids: string[], archivedAt: Date | null) {
    const result = await this.db
      .update(deal)
      .set({ archivedAt, updatedAt: new Date() })
      .where(inJsonArray(deal.id, ids));
    return result.meta.changes;
  }
  activeMember(id: string) {
    return this.db.query.singletonMembership.findFirst({
      where: and(
        eq(singletonMembership.userId, id),
        eq(singletonMembership.status, "active"),
      ),
    });
  }
  company(id: string) {
    return this.db.query.company.findFirst({ where: eq(company.id, id) });
  }
  contact(id: string) {
    return this.db.query.contact.findFirst({ where: eq(contact.id, id) });
  }
  stage(id: string) {
    return this.db.query.dealStage.findFirst({ where: eq(dealStage.id, id) });
  }
  attachContact(dealId: string, contactId: string, role: string | null) {
    return this.db
      .insert(dealContact)
      .values({ dealId, contactId, role })
      .returning()
      .get();
  }
  setContactRole(dealId: string, contactId: string, role: string | null) {
    return this.db
      .update(dealContact)
      .set({ role })
      .where(
        and(
          eq(dealContact.dealId, dealId),
          eq(dealContact.contactId, contactId),
        ),
      )
      .returning()
      .get();
  }
  detachContact(dealId: string, contactId: string) {
    return this.db
      .delete(dealContact)
      .where(
        and(
          eq(dealContact.dealId, dealId),
          eq(dealContact.contactId, contactId),
        ),
      )
      .returning()
      .get();
  }
  async hasIncompatibleContact(dealId: string, companyId: string) {
    const row = await this.db
      .select({ id: contact.id })
      .from(dealContact)
      .innerJoin(contact, eq(contact.id, dealContact.contactId))
      .where(
        and(
          eq(dealContact.dealId, dealId),
          or(
            sql`${contact.companyId} IS NULL`,
            sql`${contact.companyId} != ${companyId}`,
          )!,
        ),
      )
      .limit(1);
    return row.length > 0;
  }

  private where(input: DealListInput): SQL<unknown> {
    const conditions: SQL<unknown>[] = [
      input.archived ? isNotNull(deal.archivedAt) : isNull(deal.archivedAt),
    ];
    if (input.q)
      conditions.push(
        or(
          like(deal.name, `%${input.q}%`),
          like(deal.description, `%${input.q}%`),
        )!,
      );
    if (input.stage.length) conditions.push(inJsonArray(deal.stageId, input.stage));
    if (input.company.length)
      conditions.push(inJsonArray(deal.companyId, input.company));
    if (input.owner.length)
      conditions.push(inJsonArray(deal.ownerMembershipId, input.owner));
    return and(...conditions)!;
  }

  private order(sort: DealListInput["sort"], dir: DealListInput["dir"]) {
    const column =
      sort === "name"
        ? deal.name
        : sort === "stage"
          ? deal.stageId
          : sort === "amount"
            ? deal.amountMinor
            : sort === "expectedCloseAt"
              ? deal.expectedCloseAt
              : sort === "lastActivityAt"
                ? deal.lastActivityAt
                : sort === "archivedAt"
                  ? deal.archivedAt
                  : deal.createdAt;
    return dir === "desc" ? desc(column) : asc(column);
  }
}
