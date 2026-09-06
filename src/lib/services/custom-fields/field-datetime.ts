import { Temporal } from "@js-temporal/polyfill";

export function localDateTime(instant: string, timeZone: string): string {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone).toPlainDateTime().toString({ fractionalSecondDigits: 3 });
}

export function resolveLocalDateTime(local: string, timeZone: string): { instant: string; offset: string }[] {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(local)) throw new RangeError("Expected local datetime with millisecond precision");
  if (Number(local.slice(11, 13)) > 23 || Number(local.slice(14, 16)) > 59 || Number(local.slice(17, 19) || 0) > 59) throw new RangeError("Invalid local time");
  const plain = Temporal.PlainDateTime.from(local, { overflow: "reject" });
  const candidates = ["earlier", "later"].map(disambiguation => plain.toZonedDateTime(timeZone, { disambiguation: disambiguation as "earlier" | "later" }));
  return [...new Map(candidates.filter(candidate => candidate.toPlainDateTime().equals(plain)).map(candidate => [candidate.epochMilliseconds, { instant: candidate.toInstant().toString({ fractionalSecondDigits: 3 }), offset: candidate.offset }])).values()];
}
