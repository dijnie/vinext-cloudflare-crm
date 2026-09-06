import {env} from "cloudflare:workers";
import {activityEntryOutputSchema} from "@/lib/services/activities/activity-contract";
import {taskCreateInputSchema,taskListInputSchema,taskListOutputSchema} from "@/lib/services/tasks/task-contract";
import {parseSearchParams} from "@/lib/listing/list-contract";
import {createCompositionRoot,type CompositionRoot,type RuntimeEnv} from "@/lib/composition-root";
import {createRouteHandler} from "@/lib/http/route-handler";
export const createTasksGetHandler=(root:CompositionRoot)=>createRouteHandler(root,{output:taskListOutputSchema,handle:({context,request})=>root.tasks.list(context,parseSearchParams(request,taskListInputSchema))});
export const createTasksPostHandler=(root:CompositionRoot)=>createRouteHandler(root,{input:taskCreateInputSchema,output:activityEntryOutputSchema,unsafe:true,handle:({context,input})=>root.tasks.create(context,input)});
export function GET(request:Request){return createTasksGetHandler(createCompositionRoot(env as RuntimeEnv))(request);}
export function POST(request:Request){return createTasksPostHandler(createCompositionRoot(env as RuntimeEnv))(request);}
