import type { RequestContext } from "@/server/request-context";
import { HttpError } from "@/server/http-errors";
import type {
  CompanyCreateInput,
  CompanyListInput,
  CompanyUpdateData,
} from "@/crm/contracts/company-contract";
import { toIso } from "@/crm/contracts/list-contract";
import {
  blankToNull,
  normalizeDomain,
  normalizeEmail,
  relationError,
} from "@/crm/service-utils";
import type { AppDatabase } from "@/db/client";

import { CompanyRepository } from "./company-repository";

export class CompanyService {
  private readonly repository: CompanyRepository;
  constructor(db: AppDatabase) {
    this.repository = new CompanyRepository(db);
  }

  async list(context: RequestContext, input: CompanyListInput) {
    this.guard(context);
    const result = await this.repository.list(input);
    return {
      total: result.total,
      facets: result.facets,
      customFields: result.customFields,
      fieldFacets: result.fieldFacets,
      fieldUserLabels: result.fieldUserLabels,
      rows: result.rows.map((row) => ({
        ...row,
        owner: row.ownerMembershipId
          ? {
              membershipId: row.ownerMembershipId,
              name: row.ownerName,
              email: row.ownerEmail,
            }
          : null,
        ownerName: undefined,
        ownerEmail: undefined,
        lastActivityAt: toIso(row.lastActivityAt),
        archivedAt: toIso(row.archivedAt),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async byId(context: RequestContext, id: string) {
    this.guard(context);
    const row = await this.repository.byId(id);
    if (!row) throw new HttpError(404, "not_found", "Company was not found");
    return {
      ...row,
      owner: row.ownerMembershipId
        ? {
            membershipId: row.ownerMembershipId,
            name: row.ownerName,
            email: row.ownerEmail,
          }
        : null,
      ownerName: undefined,
      ownerEmail: undefined,
      lastActivityAt: toIso(row.lastActivityAt),
      archivedAt: toIso(row.archivedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      deals: row.deals.map((deal) => ({
        ...deal,
        archivedAt: toIso(deal.archivedAt),
      })),
    };
  }

  async create(context: RequestContext, input: CompanyCreateInput) {
    this.guard(context);
    await this.requireOwner(input.ownerMembershipId);
    const now = new Date();
    const domain = normalizeDomain(input.domain) ?? null;
    try {
      const row = await this.repository.create({
        id: crypto.randomUUID(),
        name: input.name,
        domain,
        website: domain ? `https://${domain}` : null,
        ownerMembershipId: input.ownerMembershipId ?? null,
        createdAt: now,
        updatedAt: now,
      });
      return { id: row.id, name: row.name, domain: row.domain };
    } catch (error) {
      relationError(error, "An active company already uses that domain");
    }
  }

  async update(context: RequestContext, id: string, input: CompanyUpdateData) {
    this.guard(context);
    if (!(await this.repository.byId(id)))
      throw new HttpError(404, "not_found", "Company was not found");
    await this.requireOwner(input.ownerMembershipId);
    const values: Partial<Parameters<CompanyRepository["update"]>[1]> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) values.name = input.name;
    if (input.domain !== undefined)
      values.domain = normalizeDomain(input.domain);
    if (input.website !== undefined)
      values.website = blankToNull(input.website);
    if (input.description !== undefined)
      values.description = blankToNull(input.description);
    if (input.industry !== undefined)
      values.industry = blankToNull(input.industry);
    if (input.city !== undefined) values.city = blankToNull(input.city);
    if (input.countryCode !== undefined) values.countryCode = input.countryCode;
    if (input.phone !== undefined) values.phone = blankToNull(input.phone);
    if (input.email !== undefined) values.email = normalizeEmail(input.email);
    if (input.ownerMembershipId !== undefined)
      values.ownerMembershipId = input.ownerMembershipId;
    try {
      const row = await this.repository.update(id, values);
      return { id: row.id, name: row.name, domain: row.domain };
    } catch (error) {
      relationError(error, "An active company already uses that domain");
    }
  }

  async archive(context: RequestContext, id: string, restore = false) {
    this.guard(context);
    try {
      const row = await this.repository.archive(
        id,
        restore ? null : new Date(),
      );
      if (!row) throw new HttpError(404, "not_found", "Company was not found");
      return { id: row.id, name: row.name, archivedAt: toIso(row.archivedAt) };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      relationError(error, "An active company already uses that domain");
    }
  }

  async bulkArchive(context: RequestContext, ids: string[], restore = false) {
    this.guard(context);
    try {
      const succeeded = await this.repository.bulkArchive(ids, restore ? null : new Date());
      return { requested: ids.length, succeeded, failed: ids.length - succeeded };
    } catch (error) { relationError(error, "Restored records conflict with active records"); }
  }

  private guard(context: RequestContext) {
    if (!context.userId || !context.membershipId)
      throw new HttpError(
        403,
        "membership_required",
        "Active membership is required",
      );
  }
  private async requireOwner(id: string | null | undefined) {
    if (id && !(await this.repository.activeMember(id)))
      throw new HttpError(
        400,
        "validation_failed",
        "Owner must be an active member",
      );
  }
}
