import {env} from "cloudflare:workers";
import {createCompositionRoot,type RuntimeEnv} from "@/lib/composition-root";
import {HttpError,isHttpError} from "@/lib/http/http-errors";
import {applySecurityHeaders} from "@/lib/http/security-headers";
import {appTicketCreateSchema} from "@/lib/services/integrations/integration-contract";
import {parseJsonInput} from "@/lib/http/validation";
const reply=(body:unknown,status=200)=>{const headers=new Headers({"cache-control":"private, no-store","content-type":"application/json"});applySecurityHeaders(headers);return new Response(JSON.stringify(body),{status,headers});};
export async function POST(request:Request){const root=createCompositionRoot(env as RuntimeEnv),requestId=request.headers.get("cf-ray")??crypto.randomUUID();try{const token=(request.headers.get("authorization")??"").replace(/^Bearer\s+/,"");if(!token)throw new HttpError(401,"authentication_required","App token is required");return reply(await root.integrations.appCreateTicket(token,await parseJsonInput(request,appTicketCreateSchema)));}catch(error){const status=isHttpError(error)?error.status:500,code=isHttpError(error)?error.code:"internal_error";root.securityLogger({code,requestId,method:"POST",outcome:status<500?"rejected":"failed"});return reply({error:{code,requestId}},status);}}
