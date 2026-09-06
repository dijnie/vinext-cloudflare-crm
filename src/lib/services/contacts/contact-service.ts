import { requirePermission } from "../permissions/permission-policy";
import type { Permission } from "../permissions/access-contracts";
import type { AppDatabase } from "@/lib/db/database";
import type {
  ContactCreateInput,
  ContactListInput,
  ContactUpdateData,
} from "@/lib/services/contacts/contact-contract";
import { toIso } from "@/lib/listing/list-contract";
import {
  blankToNull,
  normalizeEmail,
  relationError,
} from "@/lib/services/shared/service-utils";
import { HttpError } from "@/lib/http/http-errors";
import type { RequestContext } from "@/lib/http/request-context";

import { ContactRepository } from "./contact-repository";

export class ContactService {
  private readonly repository: ContactRepository;
  constructor(private readonly db: AppDatabase) {
    this.repository = new ContactRepository(db);
  }

  async list(context: RequestContext, input: ContactListInput) {
    await this.guard(context);
    const result = await this.repository.list(input);
    return {
      total: result.total,
      facets: result.facets,
      customFields: result.customFields,
      fieldFacets: result.fieldFacets,
      fieldCustomerLabels: result.fieldCustomerLabels, fieldUserLabels: result.fieldUserLabels,
      rows: result.rows.map((row) => this.serialize(row)),
    };
  }

  async byId(context: RequestContext, id: string) {
    await this.guard(context);
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
    await this.guard(context, ["contact.create", ...(input.ownerMembershipId ? ["contact.assign" as const] : [])]);
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
      }, context);
      return { id: row.id, firstName: row.firstName, lastName: row.lastName };
    } catch (error) {
      relationError(error, "An active contact already uses that email");
    }
  }

  async update(context: RequestContext, id: string, input: ContactUpdateData) {
    await this.guard(context, ["contact.update", ...(input.ownerMembershipId !== undefined ? ["contact.assign" as const] : [])]);
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
      const row = await this.repository.update(id, values, context);
      return { id: row.id, firstName: row.firstName, lastName: row.lastName };
    } catch (error) {
      relationError(error, "An active contact already uses that email");
    }
  }

  async archive(context: RequestContext, id: string, restore = false) {
    await this.guard(context, [restore ? "contact.restore" : "contact.archive"]);
    try {
      const row = await this.repository.archive(
        id,
        restore ? null : new Date(),
        context,
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
    await this.guard(context, [restore ? "contact.restore" : "contact.archive"]);
    try {
      const succeeded = await this.repository.bulkArchive(ids, restore ? null : new Date(), context);
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

  private guard(context: RequestContext, permissions: Permission[] = []) {
    return requirePermission(this.db, context, permissions);
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
