import { env } from "cloudflare:workers";

import {
  dealDetailOutputSchema,
  dealIdSchema,
  dealMutationInputSchema,
  dealMutationOutputSchema,
} from "@/crm/contracts/deal-contract";
import {
  createCompositionRoot,
  type CompositionRoot,
  type RuntimeEnv,
} from "@/server/composition-root";
import { HttpError } from "@/server/http-errors";
import { createRouteHandler } from "@/server/route-handler";

type RouteParams = Promise<{ dealId: string }>;

async function parseDealId(params: RouteParams) {
  const result = dealIdSchema.safeParse((await params).dealId);
  if (!result.success) {
    throw new HttpError(400, "validation_failed", "Deal ID is invalid");
  }
  return result.data;
}

export function createDealGetHandler(
  root: CompositionRoot,
  params: RouteParams,
) {
  return createRouteHandler(root, {
    output: dealDetailOutputSchema,
    async handle({ context }) {
      return root.deals.byId(context, await parseDealId(params));
    },
  });
}

export function createDealPatchHandler(
  root: CompositionRoot,
  params: RouteParams,
) {
  return createRouteHandler(root, {
    input: dealMutationInputSchema,
    output: dealMutationOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      const id = await parseDealId(params);
      if (input.action === "update") {
        return root.deals.update(context, id, input.data);
      }
      return root.deals.archive(context, id, input.action === "restore");
    },
  });
}

export function GET(request: Request, { params }: { params: RouteParams }) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createDealGetHandler(root, params)(request);
}

export function PATCH(request: Request, { params }: { params: RouteParams }) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createDealPatchHandler(root, params)(request);
}
