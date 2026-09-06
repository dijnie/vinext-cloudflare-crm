import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { orderCreateInputSchema,orderPreviewOutputSchema } from "@/lib/services/orders/order-contract";
export function createPostHandler(root:CompositionRoot) {return createRouteHandler(root,{unsafe:true,input:orderCreateInputSchema,output:orderPreviewOutputSchema,handle:({context,input})=>root.orders.preview(context,input)});}
export function POST(request:Request) {return createPostHandler(createCompositionRoot(env as RuntimeEnv))(request);}
