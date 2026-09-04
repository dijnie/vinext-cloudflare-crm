import type { AppDatabase } from "@/db/client";
import { currencyError } from "@/currency/currency-service";
import type {
  DealCreateInput,
  DealListInput,
  DealUpdateData,
} from "@/crm/contracts/deal-contract";
import { toIso } from "@/crm/contracts/list-contract";
import { blankToNull, relationError } from "@/crm/service-utils";
import { HttpError } from "@/server/http-errors";
import type { RequestContext } from "@/server/request-context";

import { DealRepository } from "./deal-repository";

export class DealService {
  private readonly repository: DealRepository;
  constructor(db: AppDatabase) {
    this.repository = new DealRepository(db);
  }

  async list(context: RequestContext, input: DealListInput) {
    this.guard(context);
    const result = await this.repository.list(input);
    return {
      total: result.total,
      facets: result.facets,
      customFields: result.customFields,
      fieldFacets: result.fieldFacets,
      fieldUserLabels: result.fieldUserLabels,
      rows: result.rows.map((row) => this.serialize(row)),
    };
  }

  async byId(context: RequestContext, id: string) {
    this.guard(context);
    const row = await this.repository.byId(id);
    if (!row) throw new HttpError(404, "not_found", "Deal was not found");
    if (!row.companyId || !row.ownerMembershipId) {
      throw new Error("Deal relationship invariant is broken");
    }
    const companyId = row.companyId;
    const ownerMembershipId = row.ownerMembershipId;
    const { contacts, stageChangedAt, ...record } = row;
    return {
      ...record,
      companyId,
      ownerMembershipId,
      owner: {
        membershipId: ownerMembershipId,
        name: record.ownerName,
        email: record.ownerEmail,
      },
      company: {
        id: companyId,
        name: record.companyName,
        domain: record.companyDomain,
      },
      ownerName: undefined,
      ownerEmail: undefined,
      companyName: undefined,
      companyDomain: undefined,
      expectedCloseAt: toIso(record.expectedCloseAt),
      fxRateAt: toIso(record.fxRateAt),
      closedAt: toIso(record.closedAt),
      lastActivityAt: toIso(record.lastActivityAt),
      archivedAt: toIso(record.archivedAt),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      stageChangedAt: stageChangedAt.toISOString(),
      contacts,
    };
  }

  async create(context: RequestContext, input: DealCreateInput) {
    this.guard(context);
    const [company, owner, stage] = await Promise.all([
      this.repository.company(input.companyId),
      this.repository.activeMember(input.ownerMembershipId),
      this.repository.stage(input.stageId),
    ]);
    if (!company)
      throw new HttpError(404, "not_found", "Company was not found");
    if (!owner)
      throw new HttpError(
        400,
        "validation_failed",
        "Owner must be an active member",
      );
    if (!stage)
      throw new HttpError(400, "validation_failed", "Deal stage is invalid");
    const now = new Date();
    try {
      const row = await this.repository.create({
        id: crypto.randomUUID(),
        name: input.name,
        companyId: input.companyId,
        ownerMembershipId: input.ownerMembershipId,
        stageId: input.stageId,
        stageChangedAt: now,
        amountMinor: input.amountMinor ?? null,
        currency: input.currency,
        expectedCloseAt: input.expectedCloseAt
          ? new Date(input.expectedCloseAt)
          : null,
        closedAt: stage.closedState === "open" ? null : now,
        createdAt: now,
        updatedAt: now,
      });
      return { id: row.id, name: row.name, companyId: row.companyId };
    } catch (error) {
      try { currencyError(error); } catch (classified) { relationError(classified, "Deal relationships are invalid"); }
    }
  }

  async update(context: RequestContext, id: string, input: DealUpdateData) {
    this.guard(context);
    const current = await this.repository.byId(id);
    if (!current) throw new HttpError(404, "not_found", "Deal was not found");
    const companyId = input.companyId ?? current.companyId;
    const ownerId = input.ownerMembershipId ?? current.ownerMembershipId;
    const stageId = input.stageId ?? current.stageId;
    if (!companyId || !(await this.repository.company(companyId)))
      throw new HttpError(404, "not_found", "Company was not found");
    if (!ownerId || !(await this.repository.activeMember(ownerId)))
      throw new HttpError(
        400,
        "validation_failed",
        "Owner must be an active member",
      );
    const stage = await this.repository.stage(stageId);
    if (!stage)
      throw new HttpError(400, "validation_failed", "Deal stage is invalid");
    if (
      input.companyId &&
      (await this.repository.hasIncompatibleContact(id, input.companyId))
    )
      throw new HttpError(
        409,
        "conflict",
        "Deal contacts belong to another company",
      );
    const now = new Date();
    const values: Parameters<DealRepository["updateWithHistory"]>[1] = {
      updatedAt: now,
    };
    if (input.name !== undefined) values.name = input.name;
    if (input.description !== undefined) values.description = input.description;
    if (input.companyId !== undefined) values.companyId = input.companyId;
    if (input.ownerMembershipId !== undefined)
      values.ownerMembershipId = input.ownerMembershipId;
    if (input.amountMinor !== undefined) values.amountMinor = input.amountMinor;
    if (input.currency !== undefined) values.currency = input.currency;
    const moneyChanged = (input.amountMinor !== undefined && input.amountMinor !== current.amountMinor) || (input.currency !== undefined && input.currency !== current.currency);
    if (moneyChanged) values.moneyRevision = current.moneyRevision + 1;
    if (input.expectedCloseAt !== undefined)
      values.expectedCloseAt = input.expectedCloseAt
        ? new Date(input.expectedCloseAt)
        : null;
    if (input.stageId !== undefined && input.stageId !== current.stageId) {
      values.stageId = input.stageId;
      values.stageChangedAt = now;
      values.closedAt = stage.closedState === "open" ? null : now;
      values.closedReason =
        stage.closedState === "lost"
          ? (input.closedReason ?? current.closedReason)
          : null;
    } else if (input.closedReason !== undefined)
      values.closedReason = input.closedReason;
    try {
      const row = await this.repository.updateWithHistory(id, values, current.stageId, context.userId, moneyChanged ? { revision:current.moneyRevision,amountMinor:current.amountMinor,currency:current.currency } : undefined);
      if (!row) throw new HttpError(409, "conflict", "Deal stage changed before this update");
      return { id: row.id, name: row.name };
    } catch (error) {
      try { currencyError(error); } catch (classified) { relationError(classified, "Deal relationships are invalid"); }
    }
  }

  async archive(context: RequestContext, id: string, restore = false) {
    this.guard(context);
    const row = await this.repository.archive(id, restore ? null : new Date());
    if (!row) throw new HttpError(404, "not_found", "Deal was not found");
    return { id: row.id, name: row.name, archivedAt: toIso(row.archivedAt) };
  }
  async bulkArchive(context: RequestContext, ids: string[], restore = false) {
    this.guard(context);
    try {
      const succeeded = await this.repository.bulkArchive(ids, restore ? null : new Date());
      return { requested: ids.length, succeeded, failed: ids.length - succeeded };
    } catch (error) { relationError(error, "Restored records conflict with active records"); }
  }

  async attachContact(
    context: RequestContext,
    dealId: string,
    contactId: string,
    role: string | null = null,
  ) {
    this.guard(context);
    await this.requireCompatible(dealId, contactId);
    try {
      return await this.repository.attachContact(
        dealId,
        contactId,
        blankToNull(role) ?? null,
      );
    } catch (error) {
      relationError(error, "Contact is already attached to this deal");
    }
  }

  async setContactRole(
    context: RequestContext,
    dealId: string,
    contactId: string,
    role: string | null,
  ) {
    this.guard(context);
    const row = await this.repository.setContactRole(
      dealId,
      contactId,
      blankToNull(role) ?? null,
    );
    if (!row)
      throw new HttpError(404, "not_found", "Deal contact was not found");
    return row;
  }
  async detachContact(
    context: RequestContext,
    dealId: string,
    contactId: string,
  ) {
    this.guard(context);
    const row = await this.repository.detachContact(dealId, contactId);
    if (!row)
      throw new HttpError(404, "not_found", "Deal contact was not found");
    return row;
  }

  private async requireCompatible(dealId: string, contactId: string) {
    const [deal, contact] = await Promise.all([
      this.repository.byId(dealId),
      this.repository.contact(contactId),
    ]);
    if (!deal || !contact)
      throw new HttpError(404, "not_found", "Deal or contact was not found");
    if (!deal.companyId || contact.companyId !== deal.companyId)
      throw new HttpError(
        409,
        "conflict",
        "Contact must belong to the deal company",
      );
  }
  private serialize<
    T extends {
      ownerMembershipId: string | null;
      ownerName: string;
      ownerEmail: string;
      companyId: string | null;
      companyName: string;
      companyDomain: string | null;
      expectedCloseAt: Date | null;
      closedAt: Date | null;
      lastActivityAt: Date | null;
      archivedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      fxRateAt: Date | null;
    },
  >(row: T) {
    if (!row.companyId || !row.ownerMembershipId) {
      throw new Error("Deal relationship invariant is broken");
    }
    const companyId = row.companyId;
    const ownerMembershipId = row.ownerMembershipId;
    return {
      ...row,
      companyId,
      ownerMembershipId,
      owner: {
        membershipId: ownerMembershipId,
        name: row.ownerName,
        email: row.ownerEmail,
      },
      company: {
        id: companyId,
        name: row.companyName,
        domain: row.companyDomain,
      },
      ownerName: undefined,
      ownerEmail: undefined,
      companyName: undefined,
      companyDomain: undefined,
      expectedCloseAt: toIso(row.expectedCloseAt),
      fxRateAt: toIso(row.fxRateAt),
      closedAt: toIso(row.closedAt),
      lastActivityAt: toIso(row.lastActivityAt),
      archivedAt: toIso(row.archivedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  private guard(context: RequestContext) {
    if (!context.userId || !context.membershipId)
      throw new HttpError(
        403,
        "membership_required",
        "Active membership is required",
      );
  }
}
