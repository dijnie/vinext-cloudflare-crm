import { Temporal } from "@js-temporal/polyfill";
import { localDateTime } from "../custom-fields/field-datetime";

type AppointmentSpan = { startsAt: string; endsAt: string };

function dayStart(day: string, timeZone: string): string {
  return Temporal.PlainDate.from(day)
    .toZonedDateTime(timeZone)
    .toInstant()
    .toString();
}

function localMinutes(value: string, timeZone: string): number {
  const local = localDateTime(value, timeZone);
  return Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
}

export function calendarInstantRange(
  start: string,
  end: string,
  timeZone: string,
): { from: string; to: string } {
  return { from: dayStart(start, timeZone), to: dayStart(end, timeZone) };
}

export function appointmentDaySegment<T extends AppointmentSpan>(
  row: T,
  day: string,
  timeZone: string,
): { day: string; row: T; start: number; end: number; startsAt: string } | null {
  const { from, to } = calendarInstantRange(
      day,
      Temporal.PlainDate.from(day).add({ days: 1 }).toString(),
      timeZone,
    ),
    dayStartMs = Date.parse(from),
    dayEndMs = Date.parse(to),
    start = Math.max(Date.parse(row.startsAt), dayStartMs),
    end = Math.min(Date.parse(row.endsAt), dayEndMs);
  if (end <= start) return null;

  const startsAt = new Date(start).toISOString(),
    visibleStart = localMinutes(startsAt, timeZone),
    localEnd = end === dayEndMs ? 1440 : localMinutes(new Date(end).toISOString(), timeZone),
    visibleEnd = Math.min(
      1440,
      Math.max(localEnd, visibleStart + (end - start) / 60000),
    );
  return { day, row, start: visibleStart, end: visibleEnd, startsAt };
}
