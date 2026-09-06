import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { leadSettingsMutationSchema, leadSettingsOutputSchema } from "@/lib/services/leads/lead-settings-contract";
export function createGetHandler(root: CompositionRoot) { return createRouteHandler(root, { output: leadSettingsOutputSchema, handle: ({ context }) => root.leadSettings.get(context) }); }
export function createPatchHandler(root: CompositionRoot) { return createRouteHandler(root, { unsafe: true, ownerOnly: true, input: leadSettingsMutationSchema, output: leadSettingsOutputSchema, handle: ({ context, input }) => root.leadSettings.mutate(context, input) }); }
export function GET(request: Request) { return createGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
export function PATCH(request: Request) { return createPatchHandler(createCompositionRoot(env as RuntimeEnv))(request); }
