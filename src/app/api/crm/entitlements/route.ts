import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import {parseSearchParams} from "@/lib/listing/list-contract";
import {entitlementListInputSchema,entitlementListOutputSchema} from "@/lib/services/entitlements/entitlement-contract";
export function createGetHandler(root:CompositionRoot){return createRouteHandler(root,{output:entitlementListOutputSchema,handle:({context,request})=>root.entitlements.list(context,parseSearchParams(request,entitlementListInputSchema))});}
export function GET(request:Request){return createGetHandler(createCompositionRoot(env as RuntimeEnv))(request);}
