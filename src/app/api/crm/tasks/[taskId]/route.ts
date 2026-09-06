import {env} from "cloudflare:workers";
import {stableIdSchema} from "@/lib/listing/list-contract";
import {taskCommandInputSchema,taskDetailOutputSchema} from "@/lib/services/tasks/task-contract";
import {createCompositionRoot,type CompositionRoot,type RuntimeEnv} from "@/lib/composition-root";
import {createRouteHandler} from "@/lib/http/route-handler";
import {HttpError} from "@/lib/http/http-errors";
const valid=(id:string)=>{if(!stableIdSchema.safeParse(id).success)throw new HttpError(400,"validation_failed","Task ID is invalid");return id;};
export const createTaskGetHandler=(root:CompositionRoot,id:string)=>createRouteHandler(root,{output:taskDetailOutputSchema,handle:({context})=>root.tasks.byId(context,valid(id))});
export const createTaskPatchHandler=(root:CompositionRoot,id:string)=>createRouteHandler(root,{input:taskCommandInputSchema,output:taskDetailOutputSchema,unsafe:true,handle:({context,input})=>root.tasks.command(context,valid(id),input)});
export async function GET(request:Request,{params}:{params:Promise<{taskId:string}>}){return createTaskGetHandler(createCompositionRoot(env as RuntimeEnv),(await params).taskId)(request);}
export async function PATCH(request:Request,{params}:{params:Promise<{taskId:string}>}){return createTaskPatchHandler(createCompositionRoot(env as RuntimeEnv),(await params).taskId)(request);}
