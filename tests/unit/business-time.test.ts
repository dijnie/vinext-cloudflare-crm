import { describe, expect, it } from "vitest";
import { businessDate, businessDayBounds, isTimeZone } from "@/lib/services/settings/business-time";
import { businessSettingsInputSchema } from "@/lib/services/settings/business-settings-contracts";

describe("business calendar", () => {
  it("validates timezones using real Intl support and validates settings inputs", () => {
    for (const zone of ["Asia/Ho_Chi_Minh", "America/New_York", "UTC"]) expect(isTimeZone(zone)).toBe(true);
    for (const zone of ["", "Mars/Olympus", "not-a-zone"]) expect(isTimeZone(zone)).toBe(false);
    expect(businessSettingsInputSchema.parse({ timeZone: " Asia/Ho_Chi_Minh ", countryCode: "vn", revision: 0 })).toEqual({ timeZone: "Asia/Ho_Chi_Minh", countryCode: "VN", revision: 0 });
    for (const data of [{ timeZone: "Mars/Olympus" }, { countryCode: "VNM" }, { countryCode: "AA" }, { countryCode: "ZZ" }, { countryCode: "EU" }, { revision: -1 }, { revision: 1.5 }, { reportingCurrency: "EUR" }]) {
      expect(businessSettingsInputSchema.safeParse({ timeZone: "UTC", countryCode: "US", revision: 0, ...data }).success).toBe(false);
    }
  });

  it("uses Ho Chi Minh midnight with an inclusive start and exclusive end", () => {
    const zone = "Asia/Ho_Chi_Minh";
    const { start, end } = businessDayBounds("2026-09-06", zone);
    expect(start.toISOString()).toBe("2026-09-05T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-06T17:00:00.000Z");
    expect(businessDate(start.getTime() - 1, zone)).toBe("2026-09-05");
    expect(businessDate(start, zone)).toBe("2026-09-06");
    expect(businessDate(end.getTime() - 1, zone)).toBe("2026-09-06");
    expect(businessDate(end, zone)).toBe("2026-09-07");
  });

  it.each([
    ["2026-03-08", "2026-03-08T05:00:00.000Z", "2026-03-09T04:00:00.000Z", 23, "2026-03-09"],
    ["2026-11-01", "2026-11-01T04:00:00.000Z", "2026-11-02T05:00:00.000Z", 25, "2026-11-02"],
  ])("preserves the DST calendar day %s", (day, startIso, endIso, hours, nextDay) => {
    const zone = "America/New_York", { start, end } = businessDayBounds(day, zone);
    expect(start.toISOString()).toBe(startIso);
    expect(end.toISOString()).toBe(endIso);
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(hours);
    expect(businessDate(start, zone)).toBe(day);
    expect(businessDate(end.getTime() - 1, zone)).toBe(day);
    expect(businessDate(end, zone)).toBe(nextDay);
  });

  it("rejects malformed, impossible and timezone-skipped dates", () => {
    for (const date of ["2026-2-01", "2026-02-30", "2026-13-01", "invalid"]) expect(() => businessDayBounds(date, "UTC")).toThrow(RangeError);
    expect(() => businessDayBounds("2011-12-30", "Pacific/Apia")).toThrow(RangeError);
    expect(() => businessDayBounds("2026-09-06", "Mars/Olympus")).toThrow(RangeError);
    expect(() => businessDate(new Date(NaN), "UTC")).toThrow(RangeError);
  });
});
