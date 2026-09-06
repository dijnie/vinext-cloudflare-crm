import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { moduleSettingsSchema, moduleUpdateInputSchema } from "@/lib/services/modules/module-contracts";
export function createModulesGetHandler(root: CompositionRoot) { return createRouteHandler(root, { output: moduleSettingsSchema, handle: ({ context }) => root.modules.get(context) }); }
export function createModulesPatchHandler(root: CompositionRoot) { return createRouteHandler(root, { unsafe: true, ownerOnly: true, input: moduleUpdateInputSchema, output: moduleSettingsSchema, handle: ({ context, input }) => root.modules.update(context, input) }); }
export function GET(request: Request) { return createModulesGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
export function PATCH(request: Request) { return createModulesPatchHandler(createCompositionRoot(env as RuntimeEnv))(request); }
