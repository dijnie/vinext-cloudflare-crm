import { DirectRecordPage, type EntityPageProps } from "@/components/app/entity-list-page";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string; slug: string; leadId: string }>; searchParams: EntityPageProps["searchParams"] }) { const values = await params; return DirectRecordPage({ entity: "lead", locale: values.locale, slug: values.slug, id: values.leadId, searchParams }); }
