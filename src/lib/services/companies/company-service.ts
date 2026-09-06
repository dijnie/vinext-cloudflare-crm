import { FieldService } from "../custom-fields/field-service";
import type { PreparedRecordCreation } from "../shared/record-fields-contract";
import { requirePermission } from "../permissions/permission-policy";
import type { Permission } from "../permissions/access-contracts";
import type { RequestContext } from "@/lib/http/request-context";
import { HttpError } from "@/lib/http/http-errors";
import type {
  CompanyCreateInput,
  CompanyListInput,
  CompanyUpdateData,
} from "@/lib/services/companies/company-contract";
import { toIso } from "@/lib/listing/list-contract";
import {
  blankToNull,
  normalizeDomain,
  normalizeEmail,
  relationError,
} from "@/lib/services/shared/service-utils";
import type { AppDatabase } from "@/lib/db/database";

import { CompanyRepository } from "./company-repository";

export class CompanyService {
  private readonly repository: CompanyRepository;
  constructor(private readonly db: AppDatabase) {
    this.repository = new CompanyRepository(db);
  }

  async list(context: RequestContext, input: CompanyListInput) {
    await this.guard(context);
    const result = await this.repository.list(input);
    return {
      total: result.total,
      facets: result.facets,
      customFields: result.customFields,
      fieldFacets: result.fieldFacets,
      fieldFileLabels: result.fieldFileLabels, fieldCustomerLabels: result.fieldCustomerLabels, fieldUserLabels: result.fieldUserLabels,
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
    await this.guard(context);
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

  async create(context: RequestContext, input: CompanyCreateInput, creation?: PreparedRecordCreation) {
    await this.guard(context, ["company.create", ...(input.ownerMembershipId ? ["company.assign" as const] : [])]);
    await this.requireOwner(input.ownerMembershipId);
    const id = creation?.recordId ?? crypto.randomUUID();
    const fields = await new FieldService(this.db).prepareValues(context, { entity: "company", recordId: id, values: input.customFields ?? {}, calendarRevision: input.calendarRevision }, "create");
    const now = new Date();
    const domain = normalizeDomain(input.domain) ?? null;
    try {
      const row = await this.repository.create({
        id,
        name: input.name,
        domain,
        website: domain ? `https://${domain}` : null,
        ownerMembershipId: input.ownerMembershipId ?? null,
        createdAt: now,
        updatedAt: now,
      }, context, fields, creation);
      return { id: row.id, name: row.name, domain: row.domain };
    } catch (error) {
      relationError(error, "An active company already uses that domain");
    }
  }

  async update(context: RequestContext, id: string, input: CompanyUpdateData) {
    await this.guard(context, ["company.update", ...(input.ownerMembershipId !== undefined ? ["company.assign" as const] : [])]);
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
    const fields = input.customFields === undefined ? undefined : await new FieldService(this.db).prepareValues(context, { entity: "company", recordId: id, values: input.customFields, calendarRevision: input.calendarRevision });
    try {
      const row = await this.repository.update(id, values, context, fields);
      return { id: row.id, name: row.name, domain: row.domain };
    } catch (error) {
      relationError(error, "An active company already uses that domain");
    }
  }

  async archive(context: RequestContext, id: string, restore = false) {
    await this.guard(context, [restore ? "company.restore" : "company.archive"]);
    try {
      const row = await this.repository.archive(
        id,
        restore ? null : new Date(),
        context,
      );
      if (!row) throw new HttpError(404, "not_found", "Company was not found");
      return { id: row.id, name: row.name, archivedAt: toIso(row.archivedAt) };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      relationError(error, "An active company already uses that domain");
    }
  }

  async bulkArchive(context: RequestContext, ids: string[], restore = false) {
    await this.guard(context, [restore ? "company.restore" : "company.archive"]);
    try {
      const succeeded = await this.repository.bulkArchive(ids, restore ? null : new Date(), context);
      return { requested: ids.length, succeeded, failed: ids.length - succeeded };
    } catch (error) { relationError(error, "Restored records conflict with active records"); }
  }

  private guard(context: RequestContext, permissions: Permission[] = []) {
    return requirePermission(this.db, context, permissions);
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
