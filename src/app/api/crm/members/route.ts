import { env } from "cloudflare:workers";

import {
  createCompositionRoot,
  type CompositionRoot,
  type RuntimeEnv,
} from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";

export function createMembersGetHandler(root: CompositionRoot) {
  return createRouteHandler(root, {
    ownerOnly: true,
    async handle({ context }) {
      return { members: await root.members.list(context) };
    },
  });
}

export async function GET(request: Request) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createMembersGetHandler(root)(request);
}
