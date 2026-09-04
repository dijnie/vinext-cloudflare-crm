import { env } from "cloudflare:workers";
import { z } from "zod";
import { entityTypeSchema } from "@/crm/list-state";
import { parseSearchParams } from "@/crm/contracts/list-contract";
import { savedViewCreateSchema, savedViewOutputSchema } from "@/views/saved-view-contracts";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/server/composition-root";
import { createRouteHandler } from "@/server/route-handler";
export function createSavedViewsGetHandler(root: CompositionRoot) { return createRouteHandler(root, { output: z.array(savedViewOutputSchema), handle: ({ context, request }) => root.views.list(context, parseSearchParams(request, z.object({ entity: entityTypeSchema }).strict()).entity) }); }
export function createSavedViewsPostHandler(root: CompositionRoot) { return createRouteHandler(root, { input: savedViewCreateSchema, output: savedViewOutputSchema, unsafe: true, handle: ({ context, input }) => root.views.create(context, input) }); }
export function GET(request: Request) { return createSavedViewsGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
export function POST(request: Request) { return createSavedViewsPostHandler(createCompositionRoot(env as RuntimeEnv))(request); }
