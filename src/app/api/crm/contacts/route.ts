import { env } from "cloudflare:workers";

import {
  contactBulkInputSchema,
  contactBulkOutputSchema,
  contactCreateInputSchema,
  contactListInputSchema,
  contactListOutputSchema,
  contactWriteOutputSchema,
} from "@/lib/services/contacts/contact-contract";
import { parseSearchParams } from "@/lib/listing/list-contract";
import {
  createCompositionRoot,
  type CompositionRoot,
  type RuntimeEnv,
} from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";

export function createContactsGetHandler(root: CompositionRoot) {
  return createRouteHandler(root, {
    output: contactListOutputSchema,
    async handle({ context, request }) {
      const input = parseSearchParams(request, contactListInputSchema, [
        "owner",
        "company",
        "title",
      ]);
      return root.contacts.list(context, input);
    },
  });
}

export function createContactsPostHandler(root: CompositionRoot) {
  return createRouteHandler(root, {
    input: contactCreateInputSchema,
    output: contactWriteOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      return root.contacts.create(context, input);
    },
  });
}

export function createContactsPatchHandler(root: CompositionRoot) {
  return createRouteHandler(root, {
    input: contactBulkInputSchema,
    output: contactBulkOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      return root.contacts.bulkArchive(context, input.ids, input.action === "bulk-restore");
    },
  });
}

export function GET(request: Request) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createContactsGetHandler(root)(request);
}

export function POST(request: Request) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createContactsPostHandler(root)(request);
}

export function PATCH(request: Request) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createContactsPatchHandler(root)(request);
}
