import { env } from "cloudflare:workers";
import { ownershipInputSchema } from "@/modules/crm/contracts/activity-contract";
import { bulkResultSchema } from "@/modules/crm/contracts/list-contract";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/server/composition-root";
import { createRouteHandler } from "@/server/route-handler";

export function createOwnershipPatchHandler(root: CompositionRoot) {
  return createRouteHandler(root, { input: ownershipInputSchema, output: bulkResultSchema, unsafe: true, handle: ({ context, input }) => root.ownership.assign(context, input) });
}
export function PATCH(request: Request) { return createOwnershipPatchHandler(createCompositionRoot(env as RuntimeEnv))(request); }
