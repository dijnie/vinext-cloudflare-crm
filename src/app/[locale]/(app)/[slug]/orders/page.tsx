import { EntityListPage, type EntityPageProps } from "@/components/app/entity-list-page";

export default function Page(props: EntityPageProps) {
  return <EntityListPage entity="order" {...props} />;
}
