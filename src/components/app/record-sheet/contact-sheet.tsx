import { RecordDetails } from "./record-details";
export function ContactSheet(props: Omit<Parameters<typeof RecordDetails>[0], "entity">) { return <RecordDetails {...props} entity="contact" />; }
