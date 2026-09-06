import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { stableIdSchema } from "@/lib/listing/list-contract";
import { HttpError } from "@/lib/http/http-errors";
type Params = Promise<{ entitlementId: string }>;
async function parseId(params: Params) { const parsed=stableIdSchema.safeParse((await params).entitlementId);if(!parsed.success)throw new HttpError(400,"validation_failed","Invalid entitlement ID");return parsed.data; }
import {entitlementRecordInputSchema,entitlementResultOutputSchema} from "@/lib/services/entitlements/entitlement-contract";
export function createPostHandler(root:CompositionRoot,params:Params){return createRouteHandler(root,{unsafe:true,input:entitlementRecordInputSchema,output:entitlementResultOutputSchema,async handle({context,input}){return root.entitlements.record(context,await parseId(params),input);}});}
export function POST(request:Request,{params}:{params:Params}){return createPostHandler(createCompositionRoot(env as RuntimeEnv),params)(request);}

import { entitlementOutputSchema } from "@/lib/services/entitlements/entitlement-contract";
export function createGetHandler(root:CompositionRoot,params:Params){return createRouteHandler(root,{output:entitlementOutputSchema,async handle({context}){return root.entitlements.byId(context,await parseId(params));}});}
export function GET(request:Request,{params}:{params:Params}){return createGetHandler(createCompositionRoot(env as RuntimeEnv),params)(request);}
