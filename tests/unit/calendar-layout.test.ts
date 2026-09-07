import { describe, expect, it } from "vitest";
import {
  appointmentDaySegment,
  calendarInstantRange,
} from "@/lib/services/appointments/calendar-layout";

describe("calendar layout", () => {
  it("resolves days whose local midnight is skipped", () => {
    expect(
      calendarInstantRange("2026-09-06", "2026-09-07", "America/Santiago"),
    ).toEqual({
      from: "2026-09-06T04:00:00Z",
      to: "2026-09-07T03:00:00Z",
    });
  });

  it("keeps an appointment spanning the repeated fall-back hour visible", () => {
    const segment = appointmentDaySegment(
      {
        startsAt: "2026-11-01T05:45:00.000Z",
        endsAt: "2026-11-01T06:15:00.000Z",
      },
      "2026-11-01",
      "America/New_York",
    );
    expect(segment).toMatchObject({ start: 105, end: 135 });
    expect(
      appointmentDaySegment(
        {
          startsAt: "2026-11-01T05:15:00.000Z",
          endsAt: "2026-11-01T06:45:00.000Z",
        },
        "2026-11-01",
        "America/New_York",
      ),
    ).toMatchObject({ start: 75, end: 165 });
  });

  it("splits an overnight appointment across both calendar days", () => {
    const row = {
      startsAt: "2026-09-09T23:30:00.000Z",
      endsAt: "2026-09-10T00:30:00.000Z",
    };
    expect(appointmentDaySegment(row, "2026-09-09", "UTC")).toMatchObject({
      start: 1410,
      end: 1440,
    });
    expect(appointmentDaySegment(row, "2026-09-10", "UTC")).toMatchObject({
      start: 0,
      end: 30,
    });
  });
});
