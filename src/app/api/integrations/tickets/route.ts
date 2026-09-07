import {env} from "cloudflare:workers";
import {createCompositionRoot,type CompositionRoot,type RuntimeEnv} from "@/lib/composition-root";
import {handleIntegrationRequest} from "@/lib/http/integration-api-handler";
import {appTicketCreateSchema} from "@/lib/services/integrations/integration-contract";
import {parseJsonInput} from "@/lib/http/validation";
export const createIntegrationTicketsPostHandler=(root:CompositionRoot)=>async(request:Request)=>handleIntegrationRequest(root,request,async token=>root.integrations.appCreateTicket(token,await parseJsonInput(request,appTicketCreateSchema)));
export function POST(request:Request){return createIntegrationTicketsPostHandler(createCompositionRoot(env as RuntimeEnv))(request);}
