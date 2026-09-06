import { RecordDetails } from "./record-details";
export function DealSheet(props: Omit<Parameters<typeof RecordDetails>[0], "entity">) { return <RecordDetails {...props} entity="deal" />; }
