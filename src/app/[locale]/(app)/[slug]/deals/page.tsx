import { EntityListPage, type EntityPageProps } from "@/components/crm/entity-list-page";
export const dynamic = "force-dynamic";
export default function Page(props: EntityPageProps) { return <EntityListPage {...props} entity="deal" />; }
