import { env } from "cloudflare:workers";
import { ownershipInputSchema } from "@/lib/services/activities/activity-contract";
import { bulkResultSchema } from "@/lib/listing/list-contract";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";

export function createOwnershipPatchHandler(root: CompositionRoot) {
  return createRouteHandler(root, { input: ownershipInputSchema, output: bulkResultSchema, unsafe: true, handle: ({ context, input }) => root.ownership.assign(context, input) });
}
export function PATCH(request: Request) { return createOwnershipPatchHandler(createCompositionRoot(env as RuntimeEnv))(request); }
