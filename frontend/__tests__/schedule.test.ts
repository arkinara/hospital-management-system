// Pure scheduling logic tests (ticket #48).
import { describe, expect, it } from "vitest";
import type { AvailabilityWindow, BlockedDay } from "@/lib/fixtures";
import {
  addDays,
  buildReadBack,
  clockToMinutes,
  dayLabel,
  dayOfWeek,
  rangesOverlap,
  validateBlock,
  validateWindow,
  weekStart,
} from "@/lib/schedule";

describe("clockToMinutes", () => {
  it("parses HH:MM into minutes since midnight", () => {
    expect(clockToMinutes("08:00")).toBe(480);
    expect(clockToMinutes("23:59")).toBe(1439);
    expect(clockToMinutes("00:00")).toBe(0);
  });

  it("returns NaN for malformed clocks", () => {
    expect(clockToMinutes("8am")).toBeNaN();
    expect(clockToMinutes("25:00")).toBeNaN();
    expect(clockToMinutes("12:60")).toBeNaN();
    expect(clockToMinutes("")).toBeNaN();
  });
});

describe("rangesOverlap", () => {
  it("detects overlapping half-open ranges", () => {
    expect(rangesOverlap(480, 900, 480, 900)).toBe(true);
    expect(rangesOverlap(480, 900, 720, 1020)).toBe(true);
    expect(rangesOverlap(480, 720, 600, 900)).toBe(true);
  });

  it("allows adjacent ranges", () => {
    expect(rangesOverlap(480, 720, 720, 1020)).toBe(false);
    expect(rangesOverlap(720, 1020, 480, 720)).toBe(false);
  });
});

describe("validateWindow", () => {
  const existing: AvailabilityWindow[] = [
    { id: 1, day_of_week: 1, start_time: "08:00", end_time: "17:00", department_id: null },
  ];

  it("rejects a window whose end is before its start", () => {
    const err = validateWindow(
      { day_of_week: 1, start_time: "15:00", end_time: "08:00" },
      existing,
    );
    expect(err).toMatch(/after start/i);
  });

  it("rejects a window overlapping an existing one on the same day", () => {
    const err = validateWindow(
      { day_of_week: 1, start_time: "12:00", end_time: "18:00" },
      existing,
    );
    expect(err).toMatch(/overlaps Tue 08:00–17:00/i);
  });

  it("allows an adjacent window on the same day", () => {
    expect(validateWindow({ day_of_week: 1, start_time: "17:00", end_time: "20:00" }, existing)).toBeNull();
  });

  it("allows a window on a different day", () => {
    expect(validateWindow({ day_of_week: 2, start_time: "08:00", end_time: "17:00" }, existing)).toBeNull();
  });
});

describe("validateBlock", () => {
  it("requires a date and a reason", () => {
    expect(validateBlock({ blocked_date: "", start_time: "", end_time: "", reason: "" })).toMatch(/date/i);
    expect(
      validateBlock({ blocked_date: "2026-09-19", start_time: "", end_time: "", reason: "  " }),
    ).toMatch(/reason/i);
  });

  it("requires start and end together", () => {
    expect(
      validateBlock({ blocked_date: "2026-09-19", start_time: "13:00", end_time: "", reason: "lunch" }),
    ).toMatch(/together/i);
  });

  it("requires end after start", () => {
    expect(
      validateBlock({
        blocked_date: "2026-09-19",
        start_time: "14:00",
        end_time: "13:00",
        reason: "lunch",
      }),
    ).toMatch(/after start/i);
  });

  it("accepts a full-day block and a timed block", () => {
    expect(
      validateBlock({ blocked_date: "2026-09-19", start_time: "", end_time: "", reason: "vacation" }),
    ).toBeNull();
    expect(
      validateBlock({
        blocked_date: "2026-09-19",
        start_time: "13:00",
        end_time: "14:00",
        reason: "lunch",
      }),
    ).toBeNull();
  });
});

describe("date helpers", () => {
  it("labels days Monday-first", () => {
    expect(dayLabel(0)).toBe("Mon");
    expect(dayLabel(6)).toBe("Sun");
  });

  it("computes day_of_week with Monday = 0", () => {
    expect(dayOfWeek("2026-09-07")).toBe(0); // Mon
    expect(dayOfWeek("2026-09-12")).toBe(5); // Sat
    expect(dayOfWeek("2026-09-13")).toBe(6); // Sun
  });

  it("finds the Monday of a week", () => {
    expect(weekStart("2026-09-12")).toBe("2026-09-07");
    expect(weekStart("2026-09-07")).toBe("2026-09-07");
    expect(weekStart("2026-09-09")).toBe("2026-09-07");
  });

  it("adds days", () => {
    expect(addDays("2026-09-12", 7)).toBe("2026-09-19");
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
  });
});

describe("buildReadBack", () => {
  const windows: AvailabilityWindow[] = [
    { id: 1, day_of_week: 0, start_time: "08:00", end_time: "17:00", department_id: 1 },
    { id: 2, day_of_week: 1, start_time: "08:00", end_time: "15:00", department_id: null },
  ];
  const blocked: BlockedDay[] = [
    { id: 3, blocked_date: "2026-08-14", start_time: null, end_time: null, reason: "vacation" },
  ];
  const dept = (id: number | null) => (id === 1 ? "GEN" : "");

  it("summarises windows and blocked days in plain English", () => {
    const summary = buildReadBack("Dr. X", windows, blocked, dept);
    expect(summary).toBe(
      "Dr. X is bookable Mon 08:00–17:00 (GEN), Tue 08:00–15:00; blocked Fri, 14 Aug 2026 (vacation)",
    );
  });

  it("handles a doctor with no windows", () => {
    expect(buildReadBack("Dr. Y", [], [], dept)).toContain("not configured for regular sessions");
  });
});