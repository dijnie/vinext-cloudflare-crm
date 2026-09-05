import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { isAppLocale } from "@/i18n/config";
import { getCrmDictionary } from "@/i18n/crm-dictionary";
import { entityPaths, parseListState, type EntityType } from "@/modules/crm/list-state";
import type { CompanyListInput } from "@/modules/crm/contracts/company-contract";
import type { ContactListInput } from "@/modules/crm/contracts/contact-contract";
import type { DealListInput } from "@/modules/crm/contracts/deal-contract";
import { stableIdSchema } from "@/modules/crm/contracts/list-contract";
import { createCompositionRoot, type RuntimeEnv } from "@/server/composition-root";
import { requireRequestContext } from "@/server/request-context";
import { isHttpError } from "@/server/http-errors";
import { EntityList } from "./entity-list";

export type EntityPageProps = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function EntityListPage({ entity, params, searchParams }: EntityPageProps & { entity: EntityType }) {
  const { locale, slug } = await params; if (!isAppLocale(locale)) notFound();
  const root = createCompositionRoot(env as RuntimeEnv); const context = await requireRequestContext(new Headers(await headers()), root);
  const query = new URLSearchParams(); for (const [key, value] of Object.entries(await searchParams)) { for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item); }
  let state; try { state = parseListState(entity, query); } catch { const labels = getCrmDictionary(locale); return <div className="space-y-4"><h1>{labels.invalidQuery}</h1><Link className="text-primary underline" href={`/${locale}/${slug}/${entityPaths[entity]}`}>{labels.reset}</Link></div>; }
  try {
    const initialData = entity === "company" ? await root.companies.list(context, state.list as CompanyListInput) : entity === "contact" ? await root.contacts.list(context, state.list as ContactListInput) : await root.deals.list(context, state.list as DealListInput);
    return <EntityList entity={entity} initialData={initialData} locale={locale} />;
  } catch (error) {
    if (!isHttpError(error) || error.status !== 400) throw error;
    const labels = getCrmDictionary(locale);
    return <div className="space-y-4"><h1>{labels.invalidQuery}</h1><Link className="text-primary underline" href={`/${locale}/${slug}/${entityPaths[entity]}`}>{labels.reset}</Link></div>;
  }
}
export async function DirectRecordPage({ entity, locale, slug, id, searchParams }: { entity: EntityType; locale: string; slug: string; id: string; searchParams: EntityPageProps["searchParams"] }) {
  if (!isAppLocale(locale) || !stableIdSchema.safeParse(id).success) notFound();
  const root = createCompositionRoot(env as RuntimeEnv); await requireRequestContext(new Headers(await headers()), root);
  const query = new URLSearchParams(); for (const [key, value] of Object.entries(await searchParams)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  query.set("recordType", entity); query.set("recordId", id); if (!query.has("tab")) query.set("tab", "details");
  redirect(`/${locale}/${slug}/${entityPaths[entity]}?${query}`);
}
