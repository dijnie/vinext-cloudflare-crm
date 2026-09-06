import {env} from "cloudflare:workers";
import {ticketCreateInputSchema,ticketDetailSchema,ticketListInputSchema,ticketListOutputSchema} from "@/lib/services/tickets/ticket-contract";
import {parseSearchParams} from "@/lib/listing/list-contract";
import {createCompositionRoot,type CompositionRoot,type RuntimeEnv} from "@/lib/composition-root";
import {createRouteHandler} from "@/lib/http/route-handler";
export const createTicketsGetHandler=(root:CompositionRoot)=>createRouteHandler(root,{output:ticketListOutputSchema,handle:({context,request})=>root.tickets.list(context,parseSearchParams(request,ticketListInputSchema))});
export const createTicketsPostHandler=(root:CompositionRoot)=>createRouteHandler(root,{input:ticketCreateInputSchema,output:ticketDetailSchema,unsafe:true,handle:({context,input})=>root.tickets.create(context,input)});
export function GET(request:Request){return createTicketsGetHandler(createCompositionRoot(env as RuntimeEnv))(request);}
export function POST(request:Request){return createTicketsPostHandler(createCompositionRoot(env as RuntimeEnv))(request);}
