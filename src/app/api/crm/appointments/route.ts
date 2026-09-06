import {env} from "cloudflare:workers";
import {appointmentCreateInputSchema,appointmentListInputSchema,appointmentListOutputSchema,appointmentRowSchema} from "@/lib/services/appointments/appointment-contract";
import {parseSearchParams} from "@/lib/listing/list-contract";
import {createCompositionRoot,type CompositionRoot,type RuntimeEnv} from "@/lib/composition-root";
import {createRouteHandler} from "@/lib/http/route-handler";
export const createAppointmentsGetHandler=(root:CompositionRoot)=>createRouteHandler(root,{output:appointmentListOutputSchema,handle:({context,request})=>root.appointments.list(context,parseSearchParams(request,appointmentListInputSchema))});
export const createAppointmentsPostHandler=(root:CompositionRoot)=>createRouteHandler(root,{input:appointmentCreateInputSchema,output:appointmentRowSchema,unsafe:true,handle:({context,input})=>root.appointments.create(context,input)});
export function GET(request:Request){return createAppointmentsGetHandler(createCompositionRoot(env as RuntimeEnv))(request);}
export function POST(request:Request){return createAppointmentsPostHandler(createCompositionRoot(env as RuntimeEnv))(request);}
