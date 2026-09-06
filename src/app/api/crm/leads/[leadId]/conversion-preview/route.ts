import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { HttpError } from "@/lib/http/http-errors";
import { stableIdSchema } from "@/lib/listing/list-contract";
import { leadConversionPreviewInputSchema, leadConversionPreviewSchema } from "@/lib/services/conversions/lead-conversion-contracts";
type Params = Promise<{ leadId: string }>;
export function createPostHandler(root: CompositionRoot, params: Params) { return createRouteHandler(root, { unsafe: true, input: leadConversionPreviewInputSchema, output: leadConversionPreviewSchema, async handle({ context, input }) { const parsed=stableIdSchema.safeParse((await params).leadId); if (!parsed.success) throw new HttpError(400,"validation_failed","Invalid lead ID"); return root.leadConversions.preview(context,parsed.data,input); } }); }
export function POST(request: Request, { params }: { params: Params }) { return createPostHandler(createCompositionRoot(env as RuntimeEnv), params)(request); }
