import {env} from "cloudflare:workers";
import {z} from "zod";
import {notificationActionSchema,notificationListOutputSchema} from "@/lib/services/notifications/notification-contract";
import {createCompositionRoot,type CompositionRoot,type RuntimeEnv} from "@/lib/composition-root";
import {createRouteHandler} from "@/lib/http/route-handler";
export const createNotificationsGetHandler=(root:CompositionRoot)=>createRouteHandler(root,{output:notificationListOutputSchema,handle:({context})=>root.notifications.list(context)});
export const createNotificationsPatchHandler=(root:CompositionRoot)=>createRouteHandler(root,{input:notificationActionSchema,output:z.object({ok:z.literal(true)}),unsafe:true,handle:({context,input})=>root.notifications.action(context,input)});
export function GET(request:Request){return createNotificationsGetHandler(createCompositionRoot(env as RuntimeEnv))(request);}
export function PATCH(request:Request){return createNotificationsPatchHandler(createCompositionRoot(env as RuntimeEnv))(request);}
