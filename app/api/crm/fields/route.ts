import { env } from "cloudflare:workers";
import { fieldCreateInputSchema, fieldDefinitionSchema, fieldListInputSchema, fieldReorderInputSchema } from "@/fields/field-contracts";
import { parseSearchParams } from "@/crm/contracts/list-contract";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/server/composition-root";
import { createRouteHandler } from "@/server/route-handler";

export function createFieldsGetHandler(root: CompositionRoot) { return createRouteHandler(root, { output: fieldDefinitionSchema.array(), handle: ({ context, request }) => root.fields.list(context, parseSearchParams(request, fieldListInputSchema)) }); }
export function createFieldsPostHandler(root: CompositionRoot) { return createRouteHandler(root, { input: fieldCreateInputSchema, output: fieldDefinitionSchema, unsafe: true, handle: ({ context, input }) => root.fields.create(context, input) }); }
export function createFieldsPatchHandler(root: CompositionRoot) { return createRouteHandler(root, { input: fieldReorderInputSchema, output: fieldDefinitionSchema.array(), unsafe: true, handle: ({ context, input }) => root.fields.reorder(context, input) }); }
export function GET(request: Request) { return createFieldsGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
export function POST(request: Request) { return createFieldsPostHandler(createCompositionRoot(env as RuntimeEnv))(request); }
export function PATCH(request: Request) { return createFieldsPatchHandler(createCompositionRoot(env as RuntimeEnv))(request); }
