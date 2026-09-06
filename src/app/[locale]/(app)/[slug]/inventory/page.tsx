import { notFound } from "next/navigation";
import { InventoryPanel } from "@/components/app/sales/inventory-panel";
import { getPageContext } from "@/lib/http/page-context";
import { isAppLocale } from "@/lib/i18n/config";
import { stableIdSchema } from "@/lib/listing/list-contract";

export default async function InventoryPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ variantId?: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const { root, context } = await getPageContext();
  const requested = stableIdSchema.safeParse((await searchParams).variantId);
  const initialData = requested.success ? { rows: [await root.inventory.byId(context, requested.data)] } : await root.inventory.list(context);
  return <InventoryPanel locale={locale} initialData={initialData} />;
}
