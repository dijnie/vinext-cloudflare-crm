import type { FieldDefinition, FieldEntity } from "../custom-fields/field-contracts";
import type { LayoutField, LayoutSurface } from "./layout-contracts";

// Detail keys use their stored input identity; renderers map owner/stage/amount labels.
export const DEFAULT_LAYOUT_KEYS: Record<FieldEntity, Record<LayoutSurface, readonly string[]>> = {
  order: {
    create: ["name", "contactId", "companyId", "ownerMembershipId", "currency", "source", "description"],
    edit: ["name", "contactId", "companyId", "ownerMembershipId", "currency", "source", "description"],
    detail: ["number", "name", "contactId", "companyId", "ownerMembershipId", "currency", "state", "source", "description", "createdAt", "updatedAt"],
  },
  product: {
    create: ["name", "kind", "categoryId", "description", "ownerMembershipId"],
    edit: ["name", "categoryId", "description", "ownerMembershipId"],
    detail: ["name", "kind", "categoryId", "description", "ownerMembershipId", "createdAt", "updatedAt"],
  },
  lead: {
    create: ["firstName", "lastName", "email", "phone", "title", "companyId", "sourceId", "statusId", "ownerMembershipId", "collaboratorMembershipIds", "description", "rejectionReason"],
    edit: ["firstName", "lastName", "email", "phone", "title", "companyId", "sourceId", "statusId", "ownerMembershipId", "collaboratorMembershipIds", "description", "rejectionReason"],
    detail: ["firstName", "lastName", "email", "phone", "title", "companyId", "sourceId", "statusId", "ownerMembershipId", "collaboratorMembershipIds", "description", "rejectionReason", "createdAt", "updatedAt"],
  },
  company: {
    create: ["name", "domain", "ownerMembershipId"],
    edit: ["name", "domain", "website", "description", "industry", "city", "countryCode", "phone", "email", "ownerMembershipId"],
    detail: ["description", "name", "domain", "website", "industry", "city", "countryCode", "phone", "email", "ownerMembershipId", "createdAt", "updatedAt"],
  },
  contact: {
    create: ["firstName", "lastName", "email", "phone", "title", "birthDate", "gender", "companyId", "ownerMembershipId"],
    edit: ["firstName", "lastName", "email", "phone", "title", "birthDate", "gender", "companyId", "ownerMembershipId"],
    detail: ["companyId", "firstName", "lastName", "email", "phone", "title", "birthDate", "gender", "ownerMembershipId", "createdAt", "updatedAt"],
  },
  deal: {
    create: ["name", "companyId", "ownerMembershipId", "stageId", "amountMinor", "currency", "expectedCloseAt"],
    edit: ["name", "companyId", "ownerMembershipId", "stageId", "amountMinor", "currency", "expectedCloseAt", "description", "closedReason"],
    detail: ["description", "companyId", "name", "stageId", "amountMinor", "currency", "expectedCloseAt", "closedReason", "ownerMembershipId", "createdAt", "updatedAt"],
  },
};

export function layoutCatalog(entity: FieldEntity, definitions: FieldDefinition[]): LayoutField[] {
  const defaults = DEFAULT_LAYOUT_KEYS[entity];
  const surfaces: LayoutSurface[] = ["create", "edit", "detail"];
  const keys = [...new Set(surfaces.flatMap(surface => defaults[surface]))];
  const required = new Set(entity === "product" ? ["name", "kind"] : entity === "contact" || entity === "lead" ? ["firstName"] : entity === "deal" ? ["name", "companyId", "ownerMembershipId", "stageId", "currency"] : entity === "order" ? ["name", "contactId", "currency"] : ["name"]);
  return [
    ...keys.map(key => ({ key, kind: "builtin" as const, visible: true, required: required.has(key), readOnly: entity === "product" && key === "kind" || entity === "order" && ["number", "state"].includes(key) || key === "createdAt" || key === "updatedAt", surfaces: surfaces.filter(surface => defaults[surface].includes(key)) })),
    ...definitions.filter(field => !field.archivedAt).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).map(field => ({ key: field.key, kind: "custom" as const, visible: field.showOnSheet, required: field.required, readOnly: field.type === "formula", surfaces: [...surfaces], label: field.label })),
  ];
}
