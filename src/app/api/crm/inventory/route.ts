import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import {parseSearchParams} from "@/lib/listing/list-contract";
import {inventoryListInputSchema,inventoryListOutputSchema} from "@/lib/services/inventory/inventory-contract";
export function createGetHandler(root:CompositionRoot){return createRouteHandler(root,{output:inventoryListOutputSchema,handle:({context,request})=>root.inventory.list(context,parseSearchParams(request,inventoryListInputSchema))});}
export function GET(request:Request){return createGetHandler(createCompositionRoot(env as RuntimeEnv))(request);}
