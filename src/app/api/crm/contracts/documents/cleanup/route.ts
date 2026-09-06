import { env } from "cloudflare:workers";
import { z } from "zod";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";

export const createContractDocumentCleanupHandler = (root: CompositionRoot) =>
  createRouteHandler(root, {
    unsafe: true,
    ownerOnly: true,
    input: z.object({}).strict(),
    output: z.object({ cleaned: z.number(), failed: z.number() }),
    handle: ({ context }) => root.contractDocuments.cleanup(context),
  });

export function POST(request: Request) {
  return createContractDocumentCleanupHandler(createCompositionRoot(env as RuntimeEnv))(request);
}
