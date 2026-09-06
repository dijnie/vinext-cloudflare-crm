import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { stableIdSchema } from "@/lib/listing/list-contract";
import { HttpError } from "@/lib/http/http-errors";
type Params = Promise<{ orderId: string }>;
async function parseId(params: Params) { const parsed=stableIdSchema.safeParse((await params).orderId);if(!parsed.success)throw new HttpError(400,"validation_failed","Invalid order ID");return parsed.data; }
import { orderMutationInputSchema, orderMutationOutputSchema, orderDetailOutputSchema } from "@/lib/services/orders/order-contract";
export function createGetHandler(root: CompositionRoot,params:Params) { return createRouteHandler(root,{output:orderDetailOutputSchema,async handle({context}) {return root.orders.byId(context,await parseId(params));}}); }
export function createPatchHandler(root: CompositionRoot,params:Params) { return createRouteHandler(root,{unsafe:true,input:orderMutationInputSchema,output:orderMutationOutputSchema,async handle({context,input}) { const id=await parseId(params);return input.action==="update"?root.orders.update(context,id,input.data):root.orders.archive(context,id,input.action==="restore");}}); }
export function GET(request:Request,{params}:{params:Params}) {return createGetHandler(createCompositionRoot(env as RuntimeEnv),params)(request);}
export function PATCH(request:Request,{params}:{params:Params}) {return createPatchHandler(createCompositionRoot(env as RuntimeEnv),params)(request);}
