import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { HttpError } from "@/lib/http/http-errors";
import { z } from "zod";
import { productVariantMutationInputSchema, productVariantOutputSchema } from "@/lib/services/catalog/product-contract";
type RouteParams = Promise<{ productId: string; variantId: string; }>;
export function createPatchHandler(root: CompositionRoot, params: RouteParams) { return createRouteHandler(root, { unsafe: true, input: productVariantMutationInputSchema, output: productVariantOutputSchema, async handle({ context, input }) {
const parsed = z.object({ productId: z.string().uuid(), variantId: z.string().uuid(), }).safeParse(await params); if (!parsed.success) throw new HttpError(400, "validation_failed", "Product or variant ID is invalid");
const { productId, variantId } = parsed.data; return input.action === "update" ? root.products.updateVariant(context, productId, variantId, input.data) : root.products.archiveVariant(context, productId, variantId, { expectedRevision: input.expectedRevision, restore: input.action === "restore" });
} }); }
export function PATCH(request: Request, { params }: { params: RouteParams }) { return createPatchHandler(createCompositionRoot(env as RuntimeEnv), params)(request); }
