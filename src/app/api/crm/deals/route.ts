import { env } from "cloudflare:workers";

import {
  dealBulkInputSchema,
  dealBulkOutputSchema,
  dealCreateInputSchema,
  dealCreateOutputSchema,
  dealListInputSchema,
  dealListOutputSchema,
} from "@/modules/crm/contracts/deal-contract";
import { parseSearchParams } from "@/modules/crm/contracts/list-contract";
import {
  createCompositionRoot,
  type CompositionRoot,
  type RuntimeEnv,
} from "@/server/composition-root";
import { createRouteHandler } from "@/server/route-handler";

export function createDealsGetHandler(root: CompositionRoot) {
  return createRouteHandler(root, {
    output: dealListOutputSchema,
    async handle({ context, request }) {
      const input = parseSearchParams(request, dealListInputSchema, [
        "owner",
        "stage",
        "company",
      ]);
      return root.deals.list(context, input);
    },
  });
}

export function createDealsPostHandler(root: CompositionRoot) {
  return createRouteHandler(root, {
    input: dealCreateInputSchema,
    output: dealCreateOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      return root.deals.create(context, input);
    },
  });
}

export function createDealsPatchHandler(root: CompositionRoot) {
  return createRouteHandler(root, {
    input: dealBulkInputSchema,
    output: dealBulkOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      return root.deals.bulkArchive(context, input.ids, input.action === "bulk-restore");
    },
  });
}

export function GET(request: Request) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createDealsGetHandler(root)(request);
}

export function POST(request: Request) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createDealsPostHandler(root)(request);
}

export function PATCH(request: Request) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createDealsPatchHandler(root)(request);
}
