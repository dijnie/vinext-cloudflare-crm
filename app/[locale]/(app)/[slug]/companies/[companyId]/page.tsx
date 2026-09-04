import { DirectRecordPage, type EntityPageProps } from "@/components/crm/entity-list-page";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string; slug: string; companyId: string }>; searchParams: EntityPageProps["searchParams"] }) { const values = await params; return DirectRecordPage({ entity: "company", locale: values.locale, slug: values.slug, id: values.companyId, searchParams }); }
