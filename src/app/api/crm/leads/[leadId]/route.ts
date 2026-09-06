import { env } from "cloudflare:workers";

import {
  leadDetailOutputSchema,
  leadIdSchema,
  leadMutationInputSchema,
  leadMutationOutputSchema,
} from "@/lib/services/leads/lead-contract";
import {
  createCompositionRoot,
  type CompositionRoot,
  type RuntimeEnv,
} from "@/lib/composition-root";
import { HttpError } from "@/lib/http/http-errors";
import { createRouteHandler } from "@/lib/http/route-handler";

type RouteParams = Promise<{ leadId: string }>;

async function parseLeadId(params: RouteParams) {
  const result = leadIdSchema.safeParse((await params).leadId);
  if (!result.success) {
    throw new HttpError(400, "validation_failed", "Lead ID is invalid");
  }
  return result.data;
}

export function createLeadGetHandler(
  root: CompositionRoot,
  params: RouteParams,
) {
  return createRouteHandler(root, {
    output: leadDetailOutputSchema,
    async handle({ context }) {
      return root.leads.byId(context, await parseLeadId(params));
    },
  });
}

export function createLeadPatchHandler(
  root: CompositionRoot,
  params: RouteParams,
) {
  return createRouteHandler(root, {
    input: leadMutationInputSchema,
    output: leadMutationOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      const id = await parseLeadId(params);
      if (input.action === "update") {
        return root.leads.update(context, id, input.data);
      }
      return root.leads.archive(context, id, input.action === "restore");
    },
  });
}

export function GET(request: Request, { params }: { params: RouteParams }) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createLeadGetHandler(root, params)(request);
}

export function PATCH(request: Request, { params }: { params: RouteParams }) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createLeadPatchHandler(root, params)(request);
}
