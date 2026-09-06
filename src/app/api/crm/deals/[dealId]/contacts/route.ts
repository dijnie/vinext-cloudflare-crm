import { env } from "cloudflare:workers";

import {
  attachDealContactInputSchema,
  dealContactOutputSchema,
  dealIdSchema,
  detachDealContactInputSchema,
  updateDealContactInputSchema,
} from "@/lib/services/deals/deal-contract";
import {
  createCompositionRoot,
  type CompositionRoot,
  type RuntimeEnv,
} from "@/lib/composition-root";
import { HttpError } from "@/lib/http/http-errors";
import { createRouteHandler } from "@/lib/http/route-handler";

type RouteParams = Promise<{ dealId: string }>;

async function parseDealId(params: RouteParams) {
  const result = dealIdSchema.safeParse((await params).dealId);
  if (!result.success) {
    throw new HttpError(400, "validation_failed", "Deal ID is invalid");
  }
  return result.data;
}

export function createDealContactPostHandler(
  root: CompositionRoot,
  params: RouteParams,
) {
  return createRouteHandler(root, {
    input: attachDealContactInputSchema,
    output: dealContactOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      return root.deals.attachContact(
        context,
        await parseDealId(params),
        input.contactId,
        input.role,
      );
    },
  });
}

export function createDealContactPatchHandler(
  root: CompositionRoot,
  params: RouteParams,
) {
  return createRouteHandler(root, {
    input: updateDealContactInputSchema,
    output: dealContactOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      return root.deals.setContactRole(
        context,
        await parseDealId(params),
        input.contactId,
        input.role,
      );
    },
  });
}

export function createDealContactDeleteHandler(
  root: CompositionRoot,
  params: RouteParams,
) {
  return createRouteHandler(root, {
    input: detachDealContactInputSchema,
    output: dealContactOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      return root.deals.detachContact(
        context,
        await parseDealId(params),
        input.contactId,
      );
    },
  });
}

export function POST(request: Request, { params }: { params: RouteParams }) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createDealContactPostHandler(root, params)(request);
}

export function PATCH(request: Request, { params }: { params: RouteParams }) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createDealContactPatchHandler(root, params)(request);
}

export function DELETE(request: Request, { params }: { params: RouteParams }) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createDealContactDeleteHandler(root, params)(request);
}
