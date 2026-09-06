import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { accessMutationSchema } from "@/lib/services/permissions/access-contracts";

export function createAccessGetHandler(root: CompositionRoot) {
  return createRouteHandler(root, { ownerOnly: true, handle: ({ context }) => root.access.settings(context) });
}
export function createAccessPostHandler(root: CompositionRoot) {
  return createRouteHandler(root, { ownerOnly: true, unsafe: true, input: accessMutationSchema, handle: ({ context, input }) => root.access.mutate(context, input) });
}
export function GET(request: Request) { return createAccessGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
export function POST(request: Request) { return createAccessPostHandler(createCompositionRoot(env as RuntimeEnv))(request); }
