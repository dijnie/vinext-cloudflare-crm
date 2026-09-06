import { DirectRecordPage, type EntityPageProps } from "@/components/app/entity-list-page";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string; slug: string; productId: string }>; searchParams: EntityPageProps["searchParams"] }) { const values = await params; return DirectRecordPage({ entity: "product", locale: values.locale, slug: values.slug, id: values.productId, searchParams }); }
