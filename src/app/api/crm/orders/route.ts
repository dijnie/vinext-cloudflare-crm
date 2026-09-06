import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { z } from "zod";
import { parseSearchParams } from "@/lib/listing/list-contract";
import { orderCreateInputSchema, orderWriteOutputSchema, orderListInputSchema, orderListOutputSchema, orderBulkInputSchema, orderBulkOutputSchema } from "@/lib/services/orders/order-contract";
export function createGetHandler(root: CompositionRoot) { return createRouteHandler(root, { output: orderListOutputSchema, handle: ({context,request}) => root.orders.list(context,parseSearchParams(request,orderListInputSchema,["owner","state","contact"])) }); }
export function createPostHandler(root: CompositionRoot) { return createRouteHandler(root, { unsafe:true,input:orderCreateInputSchema.extend({draftId:z.uuid()}),output:orderWriteOutputSchema,async handle({context,input}) { const {draftId,...data}=input;const replay=await root.orders.creationReplay(context,draftId,data);if(replay)return replay;const creation=await root.drafts.prepareConsumption(context,"order",draftId);return root.orders.create(context,data,creation); } }); }
export function createPatchHandler(root: CompositionRoot) { return createRouteHandler(root,{unsafe:true,input:orderBulkInputSchema,output:orderBulkOutputSchema,handle:({context,input})=>root.orders.bulkArchive(context,input.ids,input.action==="bulk-restore")}); }
export function GET(request: Request) { return createGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
export function POST(request: Request) { return createPostHandler(createCompositionRoot(env as RuntimeEnv))(request); }
export function PATCH(request: Request) { return createPatchHandler(createCompositionRoot(env as RuntimeEnv))(request); }
