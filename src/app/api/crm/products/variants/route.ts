import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { parseSearchParams } from "@/lib/listing/list-contract";
import { productVariantLookupInputSchema, productVariantLookupOutputSchema } from "@/lib/services/catalog/product-contract";
export function createGetHandler(root: CompositionRoot) { return createRouteHandler(root, { output: productVariantLookupOutputSchema, handle: ({ context, request }) => root.products.variants(context, parseSearchParams(request, productVariantLookupInputSchema)) }); }
export function GET(request: Request) { return createGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
