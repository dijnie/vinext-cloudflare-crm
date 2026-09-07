import {env} from "cloudflare:workers";
import {createCompositionRoot,type CompositionRoot,type RuntimeEnv} from "@/lib/composition-root";
import {HttpError} from "@/lib/http/http-errors";
import {handleIntegrationRequest} from "@/lib/http/integration-api-handler";
import {inboundEventSchema} from "@/lib/services/integrations/integration-contract";
export const createIntegrationEventHandler=(root:CompositionRoot)=>async(request:Request)=>handleIntegrationRequest(root,request,async token=>{const declared=Number(request.headers.get("content-length")??0);if(declared>262_144)throw new HttpError(413,"payload_too_large","Payload is too large");const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>262_144)throw new HttpError(413,"payload_too_large","Payload is too large");let parsed:unknown;try{parsed=JSON.parse(raw);}catch{throw new HttpError(400,"invalid_json","Body must be JSON");}return root.integrations.receive(token,inboundEventSchema.parse(parsed));});
export function POST(request:Request){return createIntegrationEventHandler(createCompositionRoot(env as RuntimeEnv))(request);}
