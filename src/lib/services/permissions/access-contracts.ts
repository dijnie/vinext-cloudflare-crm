import { z } from "zod";

export const PERMISSIONS = [
  "company.create", "company.update", "company.archive", "company.restore", "company.assign", "company.export",
  "contact.create", "contact.update", "contact.archive", "contact.restore", "contact.assign", "contact.export",
  "deal.create", "deal.update", "deal.archive", "deal.restore", "deal.assign", "deal.export",
  "product.create", "product.update", "product.archive", "product.restore", "product.assign", "product.export",
  "order.create", "order.update", "order.archive", "order.restore", "order.assign", "order.export",
  "order.confirm", "order.complete", "order.cancel", "order.collect", "order.refund", "order.adjust", "order.backdate",
  "inventory.configure", "inventory.adjust", "inventory.return", "entitlement.use", "entitlement.restore",
  "lead.create", "lead.update", "lead.archive", "lead.restore", "lead.assign", "lead.export", "lead.convert",
  "appointment.create", "appointment.update", "appointment.cancel",
  "task.create", "task.update", "task.complete", "task.reopen", "task.assign",
  "ticket.create", "ticket.update", "ticket.respond", "ticket.resolve", "ticket.reopen", "ticket.assign",
  "contract.create", "contract.update", "contract.archive", "contract.restore", "contract.assign", "contract.document", "contract.export",
  "review.create", "review.update", "review.archive", "review.restore", "review.export",
  "activity.create", "activity.update", "field.configure", "view.create", "view.update", "view.delete",
] as const;
export type Permission = typeof PERMISSIONS[number];
const OWNER_ONLY_OPERATION_PERMISSIONS = new Set<Permission>([
  "order.collect", "order.refund", "order.adjust", "order.backdate",
  "inventory.configure", "inventory.adjust", "inventory.return",
  "entitlement.use", "entitlement.restore",
]);
export const DEFAULT_MEMBER_GRANTS = PERMISSIONS.filter(permission =>
  !permission.endsWith(".export") && !OWNER_ONLY_OPERATION_PERMISSIONS.has(permission)
);
export const DEFAULT_PROFILE_ID = "standard-member";
export const idSchema = z.string().trim().min(1).max(255);
const nameSchema = z.string().trim().min(1).max(120);
const grantsSchema = z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).refine(values => new Set(values).size === values.length);
export const accessMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create-profile"), name: nameSchema, grants: grantsSchema }).strict(),
  z.object({ action: z.literal("update-profile"), id: idSchema, name: nameSchema, grants: grantsSchema }).strict(),
  z.object({ action: z.literal("delete-profile"), id: idSchema }).strict(),
  z.object({ action: z.literal("assign-profile"), membershipId: idSchema, profileId: idSchema }).strict(),
  z.object({ action: z.literal("create-branch"), name: nameSchema }).strict(),
  z.object({ action: z.literal("rename-branch"), id: idSchema, name: nameSchema }).strict(),
  z.object({ action: z.literal("archive-branch"), id: idSchema }).strict(),
  z.object({ action: z.literal("restore-branch"), id: idSchema }).strict(),
  z.object({ action: z.literal("set-default-branch"), id: idSchema }).strict(),
  z.object({ action: z.literal("assign-branches"), membershipId: idSchema, branchIds: z.array(idSchema).max(100).refine(ids => new Set(ids).size === ids.length), primaryBranchId: idSchema.nullable() }).strict().refine(input => input.primaryBranchId === null ? input.branchIds.length === 0 : input.branchIds.includes(input.primaryBranchId)),
]);
export type AccessMutation = z.infer<typeof accessMutationSchema>;
export interface AccessSettings {
  profiles: { id: string; name: string; grants: Permission[]; isDefault: boolean }[];
  branches: { id: string; name: string; archivedAt: string | null; isDefault: boolean }[];
  members: { membershipId: string; name: string; role: "owner" | "member"; status: "active" | "revoked"; profileId: string; branchIds: string[]; primaryBranchId: string | null }[];
}
