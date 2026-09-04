import { and, eq } from "drizzle-orm";

import { singletonMembership } from "@/db/schema";
import type { CompositionRoot } from "@/server/composition-root";

import { reconcileSingletonMembership } from "./singleton-workspace";

export interface SingletonAuthContext {
  userId: string;
  role: "owner" | "member";
}

export async function requireSingletonMembership(
  requestHeaders: Headers,
  root: CompositionRoot,
): Promise<SingletonAuthContext | null> {
  const session = await root.auth.api.getSession({ headers: requestHeaders });
  if (!session?.user.emailVerified) return null;

  let membership = await root.db.query.singletonMembership.findFirst({
    where: and(
      eq(singletonMembership.userId, session.user.id),
      eq(singletonMembership.status, "active"),
    ),
  });
  if (!membership) {
    try {
      await reconcileSingletonMembership(root.db, session.user.id);
    } catch {
      return null;
    }
    membership = await root.db.query.singletonMembership.findFirst({
      where: and(
        eq(singletonMembership.userId, session.user.id),
        eq(singletonMembership.status, "active"),
      ),
    });
  }
  return membership
    ? { userId: session.user.id, role: membership.role }
    : null;
}
