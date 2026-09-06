import {env} from "cloudflare:workers";
import {notificationPreferenceInputSchema,notificationPreferenceSchema} from "@/lib/services/notifications/notification-contract";
import {createCompositionRoot,type CompositionRoot,type RuntimeEnv} from "@/lib/composition-root";
import {createRouteHandler} from "@/lib/http/route-handler";
export const createNotificationPreferencesGetHandler=(root:CompositionRoot)=>createRouteHandler(root,{output:notificationPreferenceSchema,handle:({context})=>root.notifications.preferences(context)});
export const createNotificationPreferencesPatchHandler=(root:CompositionRoot)=>createRouteHandler(root,{input:notificationPreferenceInputSchema,output:notificationPreferenceSchema,unsafe:true,handle:({context,input})=>root.notifications.updatePreferences(context,input)});
export function GET(request:Request){return createNotificationPreferencesGetHandler(createCompositionRoot(env as RuntimeEnv))(request);}
export function PATCH(request:Request){return createNotificationPreferencesPatchHandler(createCompositionRoot(env as RuntimeEnv))(request);}
