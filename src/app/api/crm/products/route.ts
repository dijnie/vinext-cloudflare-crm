import { z } from "zod";
import { env } from "cloudflare:workers";

import {
  productBulkInputSchema,
  productBulkOutputSchema,
  productCreateInputSchema,
  productListInputSchema,
  productListOutputSchema,
  productWriteOutputSchema,
} from "@/lib/services/catalog/product-contract";
import { parseSearchParams } from "@/lib/listing/list-contract";
import {
  createCompositionRoot,
  type CompositionRoot,
  type RuntimeEnv,
} from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";

export function createProductsGetHandler(root: CompositionRoot) {
  return createRouteHandler(root, {
    output: productListOutputSchema,
    async handle({ context, request }) {
      const input = parseSearchParams(request, productListInputSchema, [
        "owner",
        "category",
        "kind",
      ]);
      return root.products.list(context, input);
    },
  });
}

export function createProductsPostHandler(root: CompositionRoot) {
  return createRouteHandler(root, {
    input: productCreateInputSchema.extend({ draftId: z.string().uuid().optional() }),
    output: productWriteOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      const { draftId, ...data } = input;
      const creation = draftId ? await root.drafts.prepareConsumption(context, "product", draftId) : undefined;
      return root.products.create(context, data, creation);
    },
  });
}

export function createProductsPatchHandler(root: CompositionRoot) {
  return createRouteHandler(root, {
    input: productBulkInputSchema,
    output: productBulkOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      return root.products.bulkArchive(context, input.ids, input.action === "bulk-restore");
    },
  });
}

export function GET(request: Request) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createProductsGetHandler(root)(request);
}

export function POST(request: Request) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createProductsPostHandler(root)(request);
}

export function PATCH(request: Request) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createProductsPatchHandler(root)(request);
}
