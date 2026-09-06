import type { ProductListInput } from "@/lib/services/catalog/product-contract";
import type { LeadListInput } from "@/lib/services/leads/lead-contract";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { isAppLocale } from "@/lib/i18n/config";
import { getCrmDictionary } from "@/lib/i18n/crm-dictionary";
import { entityPaths, parseListState, type EntityType } from "@/lib/listing/list-state";
import type { CompanyListInput } from "@/lib/services/companies/company-contract";
import type { ContactListInput } from "@/lib/services/contacts/contact-contract";
import type { DealListInput } from "@/lib/services/deals/deal-contract";
import type { OrderListInput } from "@/lib/services/orders/order-contract";
import { stableIdSchema } from "@/lib/listing/list-contract";
import { getPageContext } from "@/lib/http/page-context";
import { isHttpError } from "@/lib/http/http-errors";
import { EntityList } from "./entity-list";

export type EntityPageProps = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function EntityListPage({ entity, params, searchParams }: EntityPageProps & { entity: EntityType }) {
  const { locale, slug } = await params; if (!isAppLocale(locale)) notFound();
  const { root, context } = await getPageContext();
  const query = new URLSearchParams(); for (const [key, value] of Object.entries(await searchParams)) { for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item); }
  if (query.size === 0) {
    const preferred = await root.views.preferred(context, entity);
    if (preferred) {
      const next = new URLSearchParams(preferred.state.query);
      next.set("view", preferred.id);
      redirect(`/${locale}/${slug}/${entityPaths[entity]}?${next}`);
    }
  }
  let state; try { state = parseListState(entity, query); } catch { const labels = getCrmDictionary(locale); return <div className="space-y-4"><h1>{labels.invalidQuery}</h1><Link className="text-primary underline" href={`/${locale}/${slug}/${entityPaths[entity]}?page=1`}>{labels.reset}</Link></div>; }
  try {
    const initialData = entity === "company" ? await root.companies.list(context, state.list as CompanyListInput) : entity === "contact" ? await root.contacts.list(context, state.list as ContactListInput) : entity === "lead" ? await root.leads.list(context, state.list as LeadListInput) : entity === "product" ? await root.products.list(context, state.list as ProductListInput) : entity === "order" ? await root.orders.list(context, state.list as OrderListInput) : await root.deals.list(context, state.list as DealListInput);
    return <EntityList entity={entity} initialData={initialData} initialQueryKey={`${entity}:${JSON.stringify(state.list)}`} locale={locale} />;
  } catch (error) {
    if (!isHttpError(error) || error.status !== 400) throw error;
    const labels = getCrmDictionary(locale);
    return <div className="space-y-4"><h1>{labels.invalidQuery}</h1><Link className="text-primary underline" href={`/${locale}/${slug}/${entityPaths[entity]}?page=1`}>{labels.reset}</Link></div>;
  }
}
export async function DirectRecordPage({ entity, locale, slug, id, searchParams }: { entity: EntityType; locale: string; slug: string; id: string; searchParams: EntityPageProps["searchParams"] }) {
  if (!isAppLocale(locale) || !stableIdSchema.safeParse(id).success) notFound();
  await getPageContext();
  const query = new URLSearchParams(); for (const [key, value] of Object.entries(await searchParams)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  query.set("recordType", entity); query.set("recordId", id); if (!query.has("tab")) query.set("tab", "details");
  redirect(`/${locale}/${slug}/${entityPaths[entity]}?${query}`);
}
