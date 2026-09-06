import {env} from "cloudflare:workers";
import {z} from "zod";
import {createCompositionRoot,type CompositionRoot,type RuntimeEnv} from "@/lib/composition-root";
import {createRouteHandler} from "@/lib/http/route-handler";
import {workspaceMutationSchema} from "@/lib/services/settings/workspace-contract";
export const createWorkspaceGetHandler=(root:CompositionRoot)=>createRouteHandler(root,{handle:({context})=>root.workspace.get(context)});
export const createWorkspacePostHandler=(root:CompositionRoot)=>createRouteHandler<z.infer<typeof workspaceMutationSchema>,unknown>(root,{ownerOnly:true,unsafe:true,input:workspaceMutationSchema,handle:({context,input})=>{switch(input.action){case"rename":return root.workspace.rename(context,input.name,input.expectedRevision);case"copy-configuration":return root.workspace.copyConfiguration(context,input.configuration);case"schedule-deletion":return root.workspace.scheduleDeletion(context,input.confirmation);case"cancel-deletion":return root.workspace.cancelDeletion(context);case"execute-deletion":return root.workspace.executeDeletion(context,input.confirmation);case"retry-deletion":return root.workspace.retryDeletion(context);}}});
export function GET(request:Request){return createWorkspaceGetHandler(createCompositionRoot(env as RuntimeEnv))(request);}
export function POST(request:Request){return createWorkspacePostHandler(createCompositionRoot(env as RuntimeEnv))(request);}
