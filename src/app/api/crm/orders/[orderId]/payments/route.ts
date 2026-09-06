import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { stableIdSchema } from "@/lib/listing/list-contract";
import { HttpError } from "@/lib/http/http-errors";
type Params = Promise<{ orderId: string }>;
async function parseId(params: Params) { const parsed=stableIdSchema.safeParse((await params).orderId);if(!parsed.success)throw new HttpError(400,"validation_failed","Invalid order ID");return parsed.data; }
import {paymentInputSchema,paymentListOutputSchema,paymentResultOutputSchema} from "@/lib/services/payments/payment-contract";
export function createGetHandler(root:CompositionRoot,params:Params){return createRouteHandler(root,{output:paymentListOutputSchema,async handle({context}){return root.payments.list(context,await parseId(params));}});}
export function createPostHandler(root:CompositionRoot,params:Params){return createRouteHandler(root,{unsafe:true,input:paymentInputSchema,output:paymentResultOutputSchema,async handle({context,input}){return root.payments.record(context,await parseId(params),input);}});}
export function GET(request:Request,{params}:{params:Params}){return createGetHandler(createCompositionRoot(env as RuntimeEnv),params)(request);}
export function POST(request:Request,{params}:{params:Params}){return createPostHandler(createCompositionRoot(env as RuntimeEnv),params)(request);}
