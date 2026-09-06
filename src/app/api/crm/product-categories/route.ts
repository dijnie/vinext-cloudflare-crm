import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { productCategoryMutationSchema, productCategoryCatalogSchema } from "@/lib/services/catalog/product-category-contract";
export function createGetHandler(root: CompositionRoot) { return createRouteHandler(root, { output: productCategoryCatalogSchema, handle: ({ context }) => root.productCategories.get(context) }); }
export function createPatchHandler(root: CompositionRoot) { return createRouteHandler(root, { unsafe: true, ownerOnly: true, input: productCategoryMutationSchema, output: productCategoryCatalogSchema, handle: ({ context, input }) => root.productCategories.mutate(context, input) }); }
export function GET(request: Request) { return createGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
export function PATCH(request: Request) { return createPatchHandler(createCompositionRoot(env as RuntimeEnv))(request); }
