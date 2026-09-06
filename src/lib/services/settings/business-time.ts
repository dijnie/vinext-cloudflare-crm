export function isTimeZone(value: string): boolean {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
  catch { return false; }
}

function dateFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", numberingSystem: "latn", calendar: "gregory" });
}
function key(formatter: Intl.DateTimeFormat, instant: Date | number) {
  const parts = formatter.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function businessDate(instant: Date | number, timeZone: string): string {
  return key(dateFormatter(timeZone), instant);
}

// Calendar-day boundaries use the configured zone, including 23/25-hour DST days.
// Binary search avoids assuming that a local midnight has a fixed UTC offset.
export function businessDayBounds(date: string, timeZone: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError("Expected a calendar date");
  const midnight = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== date) throw new RangeError("Invalid calendar date");
  const formatter = dateFormatter(timeZone);
  const next = new Date(midnight + 86_400_000).toISOString().slice(0, 10);
  const firstInstant = (target: string) => {
    let low = midnight - 129_600_000, high = midnight + 216_000_000;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (key(formatter, middle) < target) low = middle + 1; else high = middle;
    }
    return low;
  };
  const start = firstInstant(date), end = firstInstant(next);
  if (key(formatter, start) !== date || start >= end) throw new RangeError("This calendar date does not exist in the selected zone");
  return { start: new Date(start), end: new Date(end) };
}
