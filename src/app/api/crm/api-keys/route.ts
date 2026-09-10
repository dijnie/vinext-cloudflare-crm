import { env } from "cloudflare:workers";
import {
  createCompositionRoot,
  type CompositionRoot,
  type RuntimeEnv,
} from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { apiKeyMutationSchema } from "@/lib/services/integrations/integration-contract";
import type { z } from "zod";

type Mutation = z.infer<typeof apiKeyMutationSchema>;

export const createApiKeysGetHandler = (root: CompositionRoot) =>
  createRouteHandler(root, {
    ownerOnly: true,
    handle: ({ context }) => root.integrations.apps(context),
  });
export const createApiKeysPostHandler = (root: CompositionRoot) =>
  createRouteHandler<Mutation, unknown>(root, {
    ownerOnly: true,
    unsafe: true,
    input: apiKeyMutationSchema,
    handle: ({ context, input }) => {
      switch (input.action) {
        case "create-app":
          return root.integrations.createApp(context, input.data);
        case "rotate-app":
          return root.integrations.rotateApp(context, input.id, input.revision);
        case "revoke-app":
          return root.integrations.revokeApp(context, input.id, input.revision);
      }
    },
  });

export function GET(request: Request) {
  return createApiKeysGetHandler(createCompositionRoot(env as RuntimeEnv))(
    request,
  );
}
export function POST(request: Request) {
  return createApiKeysPostHandler(createCompositionRoot(env as RuntimeEnv))(
    request,
  );
}
