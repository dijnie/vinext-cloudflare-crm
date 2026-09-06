import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { stableIdSchema } from "@/lib/listing/list-contract";
import { HttpError } from "@/lib/http/http-errors";
type Params = Promise<{ entitlementId: string }>;
async function parseId(params: Params) { const parsed=stableIdSchema.safeParse((await params).entitlementId);if(!parsed.success)throw new HttpError(400,"validation_failed","Invalid entitlement ID");return parsed.data; }
import { entitlementHistoryOutputSchema } from "@/lib/services/entitlements/entitlement-contract";
export function createGetHandler(root:CompositionRoot,params:Params){return createRouteHandler(root,{output:entitlementHistoryOutputSchema,async handle({context}){return root.entitlements.history(context,await parseId(params));}});}
export function GET(request:Request,{params}:{params:Params}){return createGetHandler(createCompositionRoot(env as RuntimeEnv),params)(request);}
