import {env} from "cloudflare:workers";
import {stableIdSchema} from "@/lib/listing/list-contract";
import {ticketCommandInputSchema,ticketDetailSchema} from "@/lib/services/tickets/ticket-contract";
import {createCompositionRoot,type CompositionRoot,type RuntimeEnv} from "@/lib/composition-root";
import {createRouteHandler} from "@/lib/http/route-handler";
import {HttpError} from "@/lib/http/http-errors";
const valid=(id:string)=>{if(!stableIdSchema.safeParse(id).success)throw new HttpError(400,"validation_failed","Ticket ID is invalid");return id;};
export const createTicketGetHandler=(root:CompositionRoot,id:string)=>createRouteHandler(root,{output:ticketDetailSchema,handle:({context})=>root.tickets.byId(context,valid(id))});
export const createTicketPatchHandler=(root:CompositionRoot,id:string)=>createRouteHandler(root,{input:ticketCommandInputSchema,output:ticketDetailSchema,unsafe:true,handle:({context,input})=>root.tickets.command(context,valid(id),input)});
export async function GET(request:Request,{params}:{params:Promise<{ticketId:string}>}){return createTicketGetHandler(createCompositionRoot(env as RuntimeEnv),(await params).ticketId)(request);}
export async function PATCH(request:Request,{params}:{params:Promise<{ticketId:string}>}){return createTicketPatchHandler(createCompositionRoot(env as RuntimeEnv),(await params).ticketId)(request);}
