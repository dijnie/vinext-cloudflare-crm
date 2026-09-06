import { RecordDetails } from "./record-details";
export function CompanySheet(props: Omit<Parameters<typeof RecordDetails>[0], "entity">) { return <RecordDetails {...props} entity="company" />; }
