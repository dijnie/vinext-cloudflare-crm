import type { RequestContext } from "@/lib/http/request-context";
import { HttpError } from "@/lib/http/http-errors";

export function requireOwnerRole(context: RequestContext): void {
  if (context.role !== "owner") {
    throw new HttpError(403, "owner_required", "Owner role is required");
  }
}

export function resolveRemovalReplacement(
  context: RequestContext,
  targetMembershipId: string,
  replacementMembershipId?: string | null,
): string | null {
  const replacement =
    replacementMembershipId === undefined
      ? context.membershipId
      : replacementMembershipId;
  if (
    replacement === targetMembershipId ||
    (targetMembershipId === context.membershipId && replacement === null)
  ) {
    throw new HttpError(
      409,
      "conflict",
      "Self-removal requires another active replacement",
    );
  }
  return replacement;
}
