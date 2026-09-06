import handler from "vinext/server/fetch-handler";
import {createCompositionRoot,type RuntimeEnv} from "../src/lib/composition-root";

const worker:ExportedHandler<RuntimeEnv>={
  fetch:handler.fetch,
  scheduled(_controller,env,context){const root=createCompositionRoot(env),transport={send:async({url,headers,body}:{url:string;headers:Headers;body:string})=>{const response=await fetch(url,{method:"POST",headers,body});return{status:response.status};}};context.waitUntil((async()=>{await root.workspace.cleanupDeletionObjects();await root.integrations.emitDue();await root.integrations.dispatchOutbox();await root.integrations.deliverDue(transport);})());},
};
export default worker;
