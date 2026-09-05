import { env } from "cloudflare:workers";
import { fieldRecordInputSchema, fieldValuesInputSchema, fieldValuesSchema } from "@/modules/fields/field-contracts";
import { parseSearchParams } from "@/modules/crm/contracts/list-contract";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/server/composition-root";
import { createRouteHandler } from "@/server/route-handler";

export function createFieldValuesGetHandler(root: CompositionRoot) { return createRouteHandler(root, { output: fieldValuesSchema, handle: ({ context, request }) => root.fields.values(context, parseSearchParams(request, fieldRecordInputSchema)) }); }
export function createFieldValuesPatchHandler(root: CompositionRoot) { return createRouteHandler(root, { input: fieldValuesInputSchema, output: fieldValuesSchema, unsafe: true, handle: ({ context, input }) => root.fields.writeValues(context, input) }); }
export function GET(request: Request) { return createFieldValuesGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
export function PATCH(request: Request) { return createFieldValuesPatchHandler(createCompositionRoot(env as RuntimeEnv))(request); }
