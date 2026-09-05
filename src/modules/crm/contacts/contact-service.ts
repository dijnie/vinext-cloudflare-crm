import type { AppDatabase } from "@/db/client";
import type {
  ContactCreateInput,
  ContactListInput,
  ContactUpdateData,
} from "@/modules/crm/contracts/contact-contract";
import { toIso } from "@/modules/crm/contracts/list-contract";
import {
  blankToNull,
  normalizeEmail,
  relationError,
} from "@/modules/crm/service-utils";
import { HttpError } from "@/server/http-errors";
import type { RequestContext } from "@/server/request-context";

import { ContactRepository } from "./contact-repository";

export class ContactService {
  private readonly repository: ContactRepository;
  constructor(db: AppDatabase) {
    this.repository = new ContactRepository(db);
  }

  async list(context: RequestContext, input: ContactListInput) {
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
    if (!row) throw new HttpError(404, "not_found", "Contact was not found");
    const { deals, ...record } = row;
    return {
      ...record,
      owner: record.ownerMembershipId
        ? {
            membershipId: record.ownerMembershipId,
            name: record.ownerName,
            email: record.ownerEmail,
          }
        : null,
      company: record.companyId
        ? {
            id: record.companyId,
            name: record.companyName,
            domain: record.companyDomain,
          }
        : null,
      ownerName: undefined,
      ownerEmail: undefined,
      companyName: undefined,
      companyDomain: undefined,
      lastActivityAt: toIso(record.lastActivityAt),
      archivedAt: toIso(record.archivedAt),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      deals: deals.map((linkedDeal) => ({
        ...linkedDeal,
        archivedAt: toIso(linkedDeal.archivedAt),
      })),
    };
  }

  async create(context: RequestContext, input: ContactCreateInput) {
    this.guard(context);
    await this.requireRelations(input.companyId, input.ownerMembershipId);
    const now = new Date();
    try {
      const row = await this.repository.create({
        id: crypto.randomUUID(),
        firstName: input.firstName,
        lastName: blankToNull(input.lastName) ?? null,
        email: normalizeEmail(input.email) ?? null,
        phone: blankToNull(input.phone) ?? null,
        title: blankToNull(input.title) ?? null,
        companyId: input.companyId ?? null,
        ownerMembershipId: input.ownerMembershipId ?? null,
        createdAt: now,
        updatedAt: now,
      });
      return { id: row.id, firstName: row.firstName, lastName: row.lastName };
    } catch (error) {
      relationError(error, "An active contact already uses that email");
    }
  }

  async update(context: RequestContext, id: string, input: ContactUpdateData) {
    this.guard(context);
    if (!(await this.repository.byId(id)))
      throw new HttpError(404, "not_found", "Contact was not found");
    await this.requireRelations(input.companyId, input.ownerMembershipId);
    if (
      input.companyId !== undefined &&
      (await this.repository.hasIncompatibleDeal(id, input.companyId))
    )
      throw new HttpError(
        409,
        "conflict",
        "Contact participates in a deal for another company",
      );
    const values: Partial<Parameters<ContactRepository["update"]>[1]> = {
      updatedAt: new Date(),
    };
    if (input.firstName !== undefined) values.firstName = input.firstName;
    if (input.lastName !== undefined)
      values.lastName = blankToNull(input.lastName);
    if (input.email !== undefined) values.email = normalizeEmail(input.email);
    if (input.phone !== undefined) values.phone = blankToNull(input.phone);
    if (input.title !== undefined) values.title = blankToNull(input.title);
    if (input.companyId !== undefined) values.companyId = input.companyId;
    if (input.ownerMembershipId !== undefined)
      values.ownerMembershipId = input.ownerMembershipId;
    try {
      const row = await this.repository.update(id, values);
      return { id: row.id, firstName: row.firstName, lastName: row.lastName };
    } catch (error) {
      relationError(error, "An active contact already uses that email");
    }
  }

  async archive(context: RequestContext, id: string, restore = false) {
    this.guard(context);
    try {
      const row = await this.repository.archive(
        id,
        restore ? null : new Date(),
      );
      if (!row) throw new HttpError(404, "not_found", "Contact was not found");
      return {
        id: row.id,
        name: [row.firstName, row.lastName].filter(Boolean).join(" "),
        archivedAt: toIso(row.archivedAt),
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      relationError(error, "An active contact already uses that email");
    }
  }

  async bulkArchive(context: RequestContext, ids: string[], restore = false) {
    this.guard(context);
    try {
      const succeeded = await this.repository.bulkArchive(ids, restore ? null : new Date());
      return { requested: ids.length, succeeded, failed: ids.length - succeeded };
    } catch (error) { relationError(error, "Restored records conflict with active records"); }
  }

  private serialize<
    T extends {
      ownerMembershipId: string | null;
      ownerName: string | null;
      ownerEmail: string | null;
      companyId: string | null;
      companyName: string | null;
      companyDomain: string | null;
      lastActivityAt: Date | null;
      archivedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
  >(row: T) {
    return {
      ...row,
      owner: row.ownerMembershipId
        ? {
            membershipId: row.ownerMembershipId,
            name: row.ownerName,
            email: row.ownerEmail,
          }
        : null,
      company: row.companyId
        ? {
            id: row.companyId,
            name: row.companyName,
            domain: row.companyDomain,
          }
        : null,
      ownerName: undefined,
      ownerEmail: undefined,
      companyName: undefined,
      companyDomain: undefined,
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
  private async requireRelations(
    companyId: string | null | undefined,
    ownerId: string | null | undefined,
  ) {
    if (companyId && !(await this.repository.company(companyId)))
      throw new HttpError(404, "not_found", "Company was not found");
    if (ownerId && !(await this.repository.activeMember(ownerId)))
      throw new HttpError(
        400,
        "validation_failed",
        "Owner must be an active member",
      );
  }
}
