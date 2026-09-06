import { env } from "cloudflare:workers";
import { currencyCodeSchema, currencyMutationSchema, currencySettingsSchema } from "@/lib/services/currencies/currency-contracts";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { HttpError } from "@/lib/http/http-errors";
import { createRouteHandler } from "@/lib/http/route-handler";

export function createCurrencyGetHandler(root: CompositionRoot) { return createRouteHandler(root,{ output:currencySettingsSchema,handle:({context,request})=>{
  const raw=new URL(request.url).searchParams.get("baseCurrency");
  const parsed=raw===null?undefined:currencyCodeSchema.safeParse(raw);
  if(parsed&&!parsed.success)throw new HttpError(400,"validation_failed","Invalid currency");
  return root.currency.settings(context,parsed?.data);
} }); }
export function createCurrencyPatchHandler(root:CompositionRoot) { return createRouteHandler(root,{input:currencyMutationSchema,output:currencySettingsSchema,unsafe:true,ownerOnly:true,handle:async({context,input})=>{
  const result=await root.currency.mutate(context,input);
  root.securityLogger({code:`currency_${input.action}`,requestId:context.requestId,method:"PATCH",outcome:"succeeded"});
  return result;
} }); }
export function GET(request:Request) { return createCurrencyGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
export function PATCH(request:Request) { return createCurrencyPatchHandler(createCompositionRoot(env as RuntimeEnv))(request); }
