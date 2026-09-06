import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { savedViewDefaultInputSchema } from "@/lib/services/saved-views/saved-view-contracts";

export function createSavedViewDefaultPutHandler(root: CompositionRoot) {
  return createRouteHandler(root, { input: savedViewDefaultInputSchema, output: savedViewDefaultInputSchema, unsafe: true, handle: ({ context, input }) => root.views.setPreferred(context, input) });
}
export function PUT(request: Request) { return createSavedViewDefaultPutHandler(createCompositionRoot(env as RuntimeEnv))(request); }
