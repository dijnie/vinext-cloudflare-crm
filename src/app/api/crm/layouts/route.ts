import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { parseSearchParams } from "@/lib/listing/list-contract";
import { layoutQuerySchema, layoutSettingsSchema, layoutUpdateSchema } from "@/lib/services/layouts/layout-contracts";
export function createLayoutsGetHandler(root: CompositionRoot) { return createRouteHandler(root, { output: layoutSettingsSchema, handle: ({ context, request }) => root.layouts.get(context, parseSearchParams(request, layoutQuerySchema)) }); }
export function createLayoutsPatchHandler(root: CompositionRoot) { return createRouteHandler(root, { unsafe: true, maxArrayItems: 500, ownerOnly: true, input: layoutUpdateSchema, output: layoutSettingsSchema, handle: ({ context, input }) => root.layouts.update(context, input) }); }
export function GET(request: Request) { return createLayoutsGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
export function PATCH(request: Request) { return createLayoutsPatchHandler(createCompositionRoot(env as RuntimeEnv))(request); }
