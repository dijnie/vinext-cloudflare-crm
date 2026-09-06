import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { stableIdSchema } from "@/lib/listing/list-contract";
import { HttpError } from "@/lib/http/http-errors";
type Params = Promise<{ variantId: string }>;
async function parseId(params: Params) { const parsed=stableIdSchema.safeParse((await params).variantId);if(!parsed.success)throw new HttpError(400,"validation_failed","Invalid variant ID");return parsed.data; }
import { inventoryHistoryOutputSchema } from "@/lib/services/inventory/inventory-contract";
export function createGetHandler(root:CompositionRoot,params:Params){return createRouteHandler(root,{output:inventoryHistoryOutputSchema,async handle({context}){return root.inventory.history(context,await parseId(params));}});}
export function GET(request:Request,{params}:{params:Params}){return createGetHandler(createCompositionRoot(env as RuntimeEnv),params)(request);}
