import { EntityListPage, type EntityPageProps } from "@/components/app/entity-list-page";
export const dynamic = "force-dynamic";
export default function Page(props: EntityPageProps) { return <EntityListPage {...props} entity="product" />; }
