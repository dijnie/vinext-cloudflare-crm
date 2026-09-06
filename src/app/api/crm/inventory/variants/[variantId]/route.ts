import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { stableIdSchema } from "@/lib/listing/list-contract";
import { HttpError } from "@/lib/http/http-errors";
type Params = Promise<{ variantId: string }>;
async function parseId(params: Params) { const parsed=stableIdSchema.safeParse((await params).variantId);if(!parsed.success)throw new HttpError(400,"validation_failed","Invalid variant ID");return parsed.data; }
import {inventoryConfigureInputSchema,inventoryConfigureOutputSchema,inventoryRecordInputSchema,inventoryResultOutputSchema} from "@/lib/services/inventory/inventory-contract";
export function createPatchHandler(root:CompositionRoot,params:Params){return createRouteHandler(root,{unsafe:true,input:inventoryConfigureInputSchema,output:inventoryConfigureOutputSchema,async handle({context,input}){return root.inventory.configure(context,await parseId(params),input);}});}
export function createPostHandler(root:CompositionRoot,params:Params){return createRouteHandler(root,{unsafe:true,input:inventoryRecordInputSchema,output:inventoryResultOutputSchema,async handle({context,input}){return root.inventory.record(context,await parseId(params),input);}});}
export function PATCH(request:Request,{params}:{params:Params}){return createPatchHandler(createCompositionRoot(env as RuntimeEnv),params)(request);}
export function POST(request:Request,{params}:{params:Params}){return createPostHandler(createCompositionRoot(env as RuntimeEnv),params)(request);}

import { inventoryVariantOutputSchema } from "@/lib/services/inventory/inventory-contract";
export function createGetHandler(root:CompositionRoot,params:Params){return createRouteHandler(root,{output:inventoryVariantOutputSchema,async handle({context}){return root.inventory.byId(context,await parseId(params));}});}
export function GET(request:Request,{params}:{params:Params}){return createGetHandler(createCompositionRoot(env as RuntimeEnv),params)(request);}
