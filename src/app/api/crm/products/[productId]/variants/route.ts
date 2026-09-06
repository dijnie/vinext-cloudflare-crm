import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { HttpError } from "@/lib/http/http-errors";
import { z } from "zod";
import { productVariantCreateInputSchema, productVariantOutputSchema } from "@/lib/services/catalog/product-contract";
type RouteParams = Promise<{ productId: string; }>;
export function createPostHandler(root: CompositionRoot, params: RouteParams) { return createRouteHandler(root, { unsafe: true, input: productVariantCreateInputSchema, output: productVariantOutputSchema, async handle({ context, input }) {
const parsed = z.object({ productId: z.string().uuid(), }).safeParse(await params); if (!parsed.success) throw new HttpError(400, "validation_failed", "Product or variant ID is invalid");
return root.products.createVariant(context, parsed.data.productId, input);
} }); }
export function POST(request: Request, { params }: { params: RouteParams }) { return createPostHandler(createCompositionRoot(env as RuntimeEnv), params)(request); }
