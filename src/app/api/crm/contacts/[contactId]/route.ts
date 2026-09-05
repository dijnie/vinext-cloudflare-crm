import { env } from "cloudflare:workers";

import {
  contactDetailOutputSchema,
  contactIdSchema,
  contactMutationInputSchema,
  contactMutationOutputSchema,
} from "@/modules/crm/contracts/contact-contract";
import {
  createCompositionRoot,
  type CompositionRoot,
  type RuntimeEnv,
} from "@/server/composition-root";
import { HttpError } from "@/server/http-errors";
import { createRouteHandler } from "@/server/route-handler";

type RouteParams = Promise<{ contactId: string }>;

async function parseContactId(params: RouteParams) {
  const result = contactIdSchema.safeParse((await params).contactId);
  if (!result.success) {
    throw new HttpError(400, "validation_failed", "Contact ID is invalid");
  }
  return result.data;
}

export function createContactGetHandler(
  root: CompositionRoot,
  params: RouteParams,
) {
  return createRouteHandler(root, {
    output: contactDetailOutputSchema,
    async handle({ context }) {
      return root.contacts.byId(context, await parseContactId(params));
    },
  });
}

export function createContactPatchHandler(
  root: CompositionRoot,
  params: RouteParams,
) {
  return createRouteHandler(root, {
    input: contactMutationInputSchema,
    output: contactMutationOutputSchema,
    unsafe: true,
    async handle({ context, input }) {
      const id = await parseContactId(params);
      if (input.action === "update") {
        return root.contacts.update(context, id, input.data);
      }
      return root.contacts.archive(context, id, input.action === "restore");
    },
  });
}

export function GET(request: Request, { params }: { params: RouteParams }) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createContactGetHandler(root, params)(request);
}

export function PATCH(request: Request, { params }: { params: RouteParams }) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createContactPatchHandler(root, params)(request);
}
