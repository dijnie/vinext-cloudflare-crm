import {env} from "cloudflare:workers";
import {createCompositionRoot,type RuntimeEnv} from "@/lib/composition-root";
import {HttpError,isHttpError} from "@/lib/http/http-errors";
import {applySecurityHeaders} from "@/lib/http/security-headers";
import {appLeadCreateSchema} from "@/lib/services/integrations/integration-contract";
import {parseJsonInput} from "@/lib/http/validation";
const reply=(body:unknown,status=200)=>{const headers=new Headers({"cache-control":"private, no-store","content-type":"application/json"});applySecurityHeaders(headers);return new Response(JSON.stringify(body),{status,headers});};
async function handle(request:Request,action:(root:ReturnType<typeof createCompositionRoot>,token:string)=>Promise<unknown>){const root=createCompositionRoot(env as RuntimeEnv),requestId=request.headers.get("cf-ray")??crypto.randomUUID();try{const token=(request.headers.get("authorization")??"").replace(/^Bearer\s+/,"");if(!token)throw new HttpError(401,"authentication_required","App token is required");return reply(await action(root,token));}catch(error){const status=isHttpError(error)?error.status:error instanceof Error&&error.name==="ZodError"?400:500,code=isHttpError(error)?error.code:status===400?"validation_failed":"internal_error";root.securityLogger({code,requestId,method:request.method,outcome:status<500?"rejected":"failed"});return reply({error:{code,requestId}},status);}}
export function GET(request:Request){return handle(request,(root,token)=>{const rawLimit=new URL(request.url).searchParams.get("limit")??"100";if(!/^\d{1,3}$/.test(rawLimit)||Number(rawLimit)<1||Number(rawLimit)>100)throw new HttpError(400,"validation_failed","Limit must be an integer from 1 to 100");return root.integrations.appLeads(token,Number(rawLimit)).then(rows=>({rows}));});}
export function POST(request:Request){return handle(request,async(root,token)=>root.integrations.appCreateLead(token,await parseJsonInput(request,appLeadCreateSchema)));}
