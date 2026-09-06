import { getLeadDictionary } from "@/lib/i18n/lead-dictionary";
import { recordName } from "../record-types";
import { RecordDetails } from "./record-details";
import { RecordLink } from "./record-link";
export function ContactSheet(props: Omit<Parameters<typeof RecordDetails>[0], "entity">) {
  const sources = props.record.convertedFrom as { id: string; firstName: string; lastName: string | null; convertedAt: string }[] | undefined;
  const labels = getLeadDictionary(props.locale);
  return <>{sources && sources.length > 0 && <section className="space-y-2 border-b p-5"><h3 className="text-sm font-medium">{labels.source}</h3><ul className="space-y-2 text-sm">{sources.map(source => <li key={source.id} className="flex flex-wrap gap-x-3 gap-y-1"><RecordLink entity="lead" id={source.id}>{recordName(source)}</RecordLink><time className="text-xs text-muted-foreground" dateTime={source.convertedAt}>{new Intl.DateTimeFormat(props.locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(source.convertedAt))}</time></li>)}</ul><p className="text-xs text-muted-foreground">{labels.retainedFiles}</p></section>}<RecordDetails {...props} entity="contact" /></>;
}
