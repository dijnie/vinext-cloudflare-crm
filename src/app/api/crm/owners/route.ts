import { env } from "cloudflare:workers";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { singletonMembership, user } from "@/db/schema";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/server/composition-root";
import { createRouteHandler } from "@/server/route-handler";
export function createOwnersGetHandler(root: CompositionRoot) {
  return createRouteHandler(root, {
    output: z.object({ rows: z.array(z.object({ membershipId: z.string(), name: z.string(), email: z.string() })) }),
    async handle() {
      const rows = await root.db.select({membershipId: singletonMembership.userId, name: user.name, email: user.email}).from(singletonMembership).innerJoin(user, eq(user.id, singletonMembership.userId)).where(eq(singletonMembership.status, "active")).orderBy(asc(user.name), asc(user.id));
      return { rows };
    },
  });
}
export function GET(request: Request) { return createOwnersGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
