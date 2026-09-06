import { env } from "cloudflare:workers";

import {
  productDetailOutputSchema,
  productIdSchema,
  productMutationInputSchema,
  productMutationOutputSchema,
} from "@/lib/services/catalog/product-contract";
import {
  createCompositionRoot,
  type CompositionRoot,
  type RuntimeEnv,
} from "@/lib/composition-root";
import { HttpError } from "@/lib/http/http-errors";
import { createRouteHandler } from "@/lib/http/route-handler";

type RouteParams = Promise<{ productId: string }>;

async function parseProductId(params: RouteParams) {
  const result = productIdSchema.safeParse((await params).productId);
  if (!result.success) {
    throw new HttpError(400, "validation_failed", "Product ID is invalid");
  }
  return result.data;
}

export function createProductGetHandler(
  root: CompositionRoot,
  params: RouteParams,
) {
  return createRouteHandler(root, {
    output: productDetailOutputSchema,
    async handle({ context }) {
      return root.products.byId(context, await parseProductId(params));
    },
  });
}

export function createProductPatchHandler(
  root: CompositionRoot,
  params: RouteParams,
) {
  return createRouteHandler(root, {
    input: productMutationInputSchema,
    output: productMutationOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      const id = await parseProductId(params);
      if (input.action === "update") {
        return root.products.update(context, id, input.data);
      }
      return root.products.archive(context, id, input.action === "restore");
    },
  });
}

export function GET(request: Request, { params }: { params: RouteParams }) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createProductGetHandler(root, params)(request);
}

export function PATCH(request: Request, { params }: { params: RouteParams }) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createProductPatchHandler(root, params)(request);
}
