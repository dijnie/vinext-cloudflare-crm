import {env} from "cloudflare:workers";
import {createCompositionRoot,type CompositionRoot,type RuntimeEnv} from "@/lib/composition-root";
import {createRouteHandler} from "@/lib/http/route-handler";
import {webformCreateSchema} from "@/lib/services/webforms/webform-contract";
export const createWebformsGetHandler=(root:CompositionRoot)=>createRouteHandler(root,{ownerOnly:true,handle:({context})=>root.webforms.list(context)});
export const createWebformsPostHandler=(root:CompositionRoot)=>createRouteHandler(root,{ownerOnly:true,unsafe:true,input:webformCreateSchema,handle:({context,input})=>root.webforms.create(context,input)});
export function GET(request:Request){return createWebformsGetHandler(createCompositionRoot(env as RuntimeEnv))(request);}
export function POST(request:Request){return createWebformsPostHandler(createCompositionRoot(env as RuntimeEnv))(request);}
