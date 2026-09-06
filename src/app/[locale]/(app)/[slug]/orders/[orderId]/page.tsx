import { DirectRecordPage, type EntityPageProps } from "@/components/app/entity-list-page";

export default async function Page({ params, searchParams }: { params: Promise<{ locale: string; slug: string; orderId: string }>; searchParams: EntityPageProps["searchParams"] }) {
  const values = await params;
  return DirectRecordPage({ entity: "order", locale: values.locale, slug: values.slug, id: values.orderId, searchParams });
}
