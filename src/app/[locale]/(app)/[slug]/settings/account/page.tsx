import {notFound} from "next/navigation";
import {ApiKeySettings} from "@/components/app/settings/api-key-settings";
import {getPageContext} from "@/lib/http/page-context";
import {isAppLocale} from "@/lib/i18n/config";

export default async function AccountSettingsPage({params}:{params:Promise<{locale:string}>}){
 const{locale}=await params;if(!isAppLocale(locale))notFound();
 const{root,context}=await getPageContext();if(context.role!=="owner")notFound();
 return <ApiKeySettings locale={locale} initialKeys={await root.integrations.apps(context) as never}/>;
}
