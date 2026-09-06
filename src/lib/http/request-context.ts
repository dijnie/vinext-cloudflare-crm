import { and, eq } from "drizzle-orm";

import { singletonMembership } from "@/lib/db/schema";
import type { CompositionRoot } from "@/lib/composition-root";

import { HttpError } from "./http-errors";

export interface RequestContext {
  readonly [guardContext]: true;
  userId: string;
  membershipId: string;
  role: "owner" | "member";
  requestId: string;
}

const guardContext: unique symbol = Symbol("guardContext");

export async function requireRequestContext(
  requestHeaders: Headers,
  root: CompositionRoot,
): Promise<RequestContext> {
  const authSession = await root.auth.api.getSession({ headers: requestHeaders });
  if (!authSession?.user.emailVerified) {
    throw new HttpError(401, "authentication_required", "Sign in is required");
  }

  const membership = await root.db.query.singletonMembership.findFirst({
    where: and(
      eq(singletonMembership.userId, authSession.user.id),
      eq(singletonMembership.status, "active"),
    ),
  });
  if (!membership) {
    throw new HttpError(403, "membership_required", "Active membership is required");
  }

  return {
    [guardContext]: true,
    userId: authSession.user.id,
    membershipId: membership.userId,
    role: membership.role,
    requestId: requestHeaders.get("cf-ray") ?? crypto.randomUUID(),
  };
}
