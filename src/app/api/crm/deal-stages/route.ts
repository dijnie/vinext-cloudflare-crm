import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { dealStageCatalogSchema, stageMutationSchema } from "@/lib/services/deals/deal-stage-contracts";
export function createDealStagesGetHandler(root: CompositionRoot) { return createRouteHandler(root, { output: dealStageCatalogSchema, handle: ({ context }) => root.dealStages.get(context) }); }
export function createDealStagesPatchHandler(root: CompositionRoot) { return createRouteHandler(root, { unsafe: true, ownerOnly: true, input: stageMutationSchema, output: dealStageCatalogSchema, handle: ({ context, input }) => root.dealStages.mutate(context, input) }); }
export function GET(request: Request) { return createDealStagesGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
export function PATCH(request: Request) { return createDealStagesPatchHandler(createCompositionRoot(env as RuntimeEnv))(request); }
