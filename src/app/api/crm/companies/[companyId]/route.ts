import { env } from "cloudflare:workers";

import {
  companyDetailOutputSchema,
  companyIdSchema,
  companyMutationInputSchema,
  companyMutationOutputSchema,
} from "@/modules/crm/contracts/company-contract";
import {
  createCompositionRoot,
  type CompositionRoot,
  type RuntimeEnv,
} from "@/server/composition-root";
import { HttpError } from "@/server/http-errors";
import { createRouteHandler } from "@/server/route-handler";

type RouteParams = Promise<{ companyId: string }>;

async function parseCompanyId(params: RouteParams) {
  const result = companyIdSchema.safeParse((await params).companyId);
  if (!result.success) {
    throw new HttpError(400, "validation_failed", "Company ID is invalid");
  }
  return result.data;
}

export function createCompanyGetHandler(
  root: CompositionRoot,
  params: RouteParams,
) {
  return createRouteHandler(root, {
    output: companyDetailOutputSchema,
    async handle({ context }) {
      return root.companies.byId(context, await parseCompanyId(params));
    },
  });
}

export function createCompanyPatchHandler(
  root: CompositionRoot,
  params: RouteParams,
) {
  return createRouteHandler(root, {
    input: companyMutationInputSchema,
    output: companyMutationOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      const id = await parseCompanyId(params);
      if (input.action === "update") {
        return root.companies.update(context, id, input.data);
      }
      return root.companies.archive(context, id, input.action === "restore");
    },
  });
}

export function GET(request: Request, { params }: { params: RouteParams }) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createCompanyGetHandler(root, params)(request);
}

export function PATCH(request: Request, { params }: { params: RouteParams }) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createCompanyPatchHandler(root, params)(request);
}
