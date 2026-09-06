import type { CompositionRoot } from "@/lib/composition-root";
import { isHttpError } from "@/lib/http/http-errors";
import { requireRequestContext } from "@/lib/http/request-context";

export interface SingletonAuthContext {
  userId: string;
  role: "owner" | "member";
}

export async function requireSingletonMembership(
  requestHeaders: Headers,
  root: CompositionRoot,
): Promise<SingletonAuthContext | null> {
  try {
    const context = await requireRequestContext(requestHeaders, root);
    return { userId: context.userId, role: context.role };
  } catch (error) {
    if (isHttpError(error) && [401, 403].includes(error.status)) return null;
    throw error;
  }
}
