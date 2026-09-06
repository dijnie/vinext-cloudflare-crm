import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { stableIdSchema } from "@/lib/listing/list-contract";
import { HttpError } from "@/lib/http/http-errors";
type Params = Promise<{ orderId: string }>;
async function parseId(params: Params) { const parsed=stableIdSchema.safeParse((await params).orderId);if(!parsed.success)throw new HttpError(400,"validation_failed","Invalid order ID");return parsed.data; }
import {orderCommandInputSchema,orderOperationOutputSchema} from "@/lib/services/orders/order-command-contract";
export function createPostHandler(root:CompositionRoot,params:Params) {return createRouteHandler(root,{unsafe:true,input:orderCommandInputSchema,output:orderOperationOutputSchema,async handle({context,input}){return root.orderCommands.execute(context,await parseId(params),input);}});}
export function POST(request:Request,{params}:{params:Params}){return createPostHandler(createCompositionRoot(env as RuntimeEnv),params)(request);}

import { orderOperationHistoryOutputSchema } from "@/lib/services/orders/order-command-contract";
export function createGetHandler(root:CompositionRoot,params:Params){return createRouteHandler(root,{output:orderOperationHistoryOutputSchema,async handle({context}){return root.orderCommands.history(context,await parseId(params));}});}
export function GET(request:Request,{params}:{params:Params}){return createGetHandler(createCompositionRoot(env as RuntimeEnv),params)(request);}
