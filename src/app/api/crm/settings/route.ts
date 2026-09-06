import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { businessSettingsInputSchema } from "@/lib/services/settings/business-settings-contracts";

export function createSettingsGetHandler(root: CompositionRoot) { return createRouteHandler(root, { handle: ({ context }) => root.settings.get(context) }); }
export function createSettingsPatchHandler(root: CompositionRoot) { return createRouteHandler(root, { unsafe: true, ownerOnly: true, input: businessSettingsInputSchema, handle: ({ context, input }) => root.settings.update(context, input) }); }
export function GET(request: Request) { return createSettingsGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
export function PATCH(request: Request) { return createSettingsPatchHandler(createCompositionRoot(env as RuntimeEnv))(request); }
