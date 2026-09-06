import {env} from "cloudflare:workers";
import {createCompositionRoot,type CompositionRoot,type RuntimeEnv} from "@/lib/composition-root";
import {createRouteHandler} from "@/lib/http/route-handler";
import {webformUpdateSchema} from "@/lib/services/webforms/webform-contract";
export const createWebformPatchHandler=(root:CompositionRoot,formId:string)=>createRouteHandler(root,{ownerOnly:true,unsafe:true,input:webformUpdateSchema.omit({id:true}),handle:({context,input})=>root.webforms.update(context,{...input,id:formId})});
export async function PATCH(request:Request,{params}:{params:Promise<{formId:string}>}){const {formId}=await params;return createWebformPatchHandler(createCompositionRoot(env as RuntimeEnv),formId)(request);}
