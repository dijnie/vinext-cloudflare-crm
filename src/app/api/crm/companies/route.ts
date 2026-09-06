import { env } from "cloudflare:workers";

import {
  companyBulkInputSchema,
  companyBulkOutputSchema,
  companyCreateInputSchema,
  companyListInputSchema,
  companyListOutputSchema,
  companyWriteOutputSchema,
} from "@/lib/services/companies/company-contract";
import { parseSearchParams } from "@/lib/listing/list-contract";
import {
  createCompositionRoot,
  type CompositionRoot,
  type RuntimeEnv,
} from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";

export function createCompaniesGetHandler(root: CompositionRoot) {
  return createRouteHandler(root, {
    output: companyListOutputSchema,
    async handle({ context, request }) {
      const input = parseSearchParams(request, companyListInputSchema, [
        "owner",
        "industry",
      ]);
      return root.companies.list(context, input);
    },
  });
}

export function createCompaniesPostHandler(root: CompositionRoot) {
  return createRouteHandler(root, {
    input: companyCreateInputSchema,
    output: companyWriteOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      return root.companies.create(context, input);
    },
  });
}

export function createCompaniesPatchHandler(root: CompositionRoot) {
  return createRouteHandler(root, {
    input: companyBulkInputSchema,
    output: companyBulkOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      return root.companies.bulkArchive(context, input.ids, input.action === "bulk-restore");
    },
  });
}

export function GET(request: Request) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createCompaniesGetHandler(root)(request);
}

export function POST(request: Request) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createCompaniesPostHandler(root)(request);
}

export function PATCH(request: Request) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createCompaniesPatchHandler(root)(request);
}
