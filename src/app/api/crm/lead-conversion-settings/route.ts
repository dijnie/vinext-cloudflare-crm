import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { leadMappingUpdateSchema, leadMappingOutputSchema } from "@/lib/services/conversions/lead-conversion-contracts";
export function createGetHandler(root: CompositionRoot) { return createRouteHandler(root, { output: leadMappingOutputSchema, handle: ({ context }) => root.leadMapping.get(context) }); }
export function createPatchHandler(root: CompositionRoot) { return createRouteHandler(root, { unsafe: true, ownerOnly: true, input: leadMappingUpdateSchema, output: leadMappingOutputSchema, handle: ({ context, input }) => root.leadMapping.update(context, input) }); }
export function GET(request: Request) { return createGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
export function PATCH(request: Request) { return createPatchHandler(createCompositionRoot(env as RuntimeEnv))(request); }
