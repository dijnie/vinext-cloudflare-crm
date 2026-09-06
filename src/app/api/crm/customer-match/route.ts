import {env} from "cloudflare:workers";
import {createCompositionRoot,type CompositionRoot,type RuntimeEnv} from "@/lib/composition-root";
import {createRouteHandler} from "@/lib/http/route-handler";
export const createCustomerMatchHandler=(root:CompositionRoot)=>createRouteHandler(root,{handle:({context,request})=>root.workspace.customerMatch(context,new URL(request.url).searchParams.get("phone")??"")});
export function GET(request:Request){return createCustomerMatchHandler(createCompositionRoot(env as RuntimeEnv))(request);}
