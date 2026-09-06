import {env} from "cloudflare:workers";
import {stableIdSchema} from "@/lib/listing/list-contract";
import {appointmentCommandInputSchema,appointmentRowSchema} from "@/lib/services/appointments/appointment-contract";
import {createCompositionRoot,type CompositionRoot,type RuntimeEnv} from "@/lib/composition-root";
import {createRouteHandler} from "@/lib/http/route-handler";
import {HttpError} from "@/lib/http/http-errors";
const valid=(id:string)=>{if(!stableIdSchema.safeParse(id).success)throw new HttpError(400,"validation_failed","Appointment ID is invalid");return id;};
export const createAppointmentGetHandler=(root:CompositionRoot,id:string)=>createRouteHandler(root,{output:appointmentRowSchema,handle:({context})=>root.appointments.byId(context,valid(id))});
export const createAppointmentPatchHandler=(root:CompositionRoot,id:string)=>createRouteHandler(root,{input:appointmentCommandInputSchema,output:appointmentRowSchema,unsafe:true,handle:({context,input})=>root.appointments.command(context,valid(id),input)});
export async function GET(request:Request,{params}:{params:Promise<{appointmentId:string}>}){return createAppointmentGetHandler(createCompositionRoot(env as RuntimeEnv),(await params).appointmentId)(request);}
export async function PATCH(request:Request,{params}:{params:Promise<{appointmentId:string}>}){return createAppointmentPatchHandler(createCompositionRoot(env as RuntimeEnv),(await params).appointmentId)(request);}
