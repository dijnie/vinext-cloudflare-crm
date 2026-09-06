import { z } from "zod";
import { env } from "cloudflare:workers";

import {
  leadBulkInputSchema,
  leadBulkOutputSchema,
  leadCreateInputSchema,
  leadListInputSchema,
  leadListOutputSchema,
  leadWriteOutputSchema,
} from "@/lib/services/leads/lead-contract";
import { parseSearchParams } from "@/lib/listing/list-contract";
import {
  createCompositionRoot,
  type CompositionRoot,
  type RuntimeEnv,
} from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";

export function createLeadsGetHandler(root: CompositionRoot) {
  return createRouteHandler(root, {
    output: leadListOutputSchema,
    async handle({ context, request }) {
      const input = parseSearchParams(request, leadListInputSchema, [
        "owner",
        "company",
        "source",
        "status",
        "collaborator",
      ]);
      return root.leads.list(context, input);
    },
  });
}

export function createLeadsPostHandler(root: CompositionRoot) {
  return createRouteHandler(root, {
    input: leadCreateInputSchema.extend({ draftId: z.string().uuid().optional() }),
    output: leadWriteOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      const { draftId, ...data } = input;
      const creation = draftId ? await root.drafts.prepareConsumption(context, "lead", draftId) : undefined;
      return root.leads.create(context, data, creation);
    },
  });
}

export function createLeadsPatchHandler(root: CompositionRoot) {
  return createRouteHandler(root, {
    input: leadBulkInputSchema,
    output: leadBulkOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      return root.leads.bulkArchive(context, input.ids, input.action === "bulk-restore");
    },
  });
}

export function GET(request: Request) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createLeadsGetHandler(root)(request);
}

export function POST(request: Request) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createLeadsPostHandler(root)(request);
}

export function PATCH(request: Request) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createLeadsPatchHandler(root)(request);
}
