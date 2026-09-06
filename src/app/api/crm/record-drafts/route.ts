import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { draftInputSchema, draftSchema } from "@/lib/services/record-drafts/draft-contracts";

export function createRecordDraftsPostHandler(root: CompositionRoot) {
  return createRouteHandler(root, { unsafe: true, input: draftInputSchema, output: draftSchema, handle: ({ context, input }) => root.drafts.create(context, input) });
}
export function POST(request: Request) { return createRecordDraftsPostHandler(createCompositionRoot(env as RuntimeEnv))(request); }
