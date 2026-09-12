/**
 * Pure scheduling helpers (ticket #48).
 *
 * Time arithmetic for availability windows and blocked periods that is shared
 * between the admin doctor-availability screen and its tests: parsing clock
 * strings, overlap detection, window validation and read-back formatting.
 * No React, no API access — safe to unit test in isolation.
 */

import type { AvailabilityWindow, BlockedDay } from "@/lib/fixtures";

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Parse an `HH:MM` clock string into minutes since midnight; NaN if malformed. */
export function clockToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return Number.NaN;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return Number.NaN;
  return hour * 60 + minute;
}

export function minutesToClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** `[aStart, aEnd)` vs `[bStart, bEnd)` overlap, all values in minutes. */
export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export interface WindowCandidate {
  day_of_week: number;
  start_time: string;
  end_time: string;
  department_id?: number | null;
}

/**
 * Validate a new window against the existing set. Returns an error string, or
 * null when the window may be added. Enforces end-after-start and rejects a
 * window that overlaps any existing window on the same weekday.
 */
export function validateWindow(
  candidate: WindowCandidate,
  existing: AvailabilityWindow[],
): string | null {
  const start = clockToMinutes(candidate.start_time);
  const end = clockToMinutes(candidate.end_time);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return "Enter valid times in HH:MM format";
  }
  if (end <= start) {
    return "End time must be after start time";
  }
  const clash = existing.find((w) => {
    if (w.day_of_week !== candidate.day_of_week) return false;
    const wStart = clockToMinutes(w.start_time);
    const wEnd = clockToMinutes(w.end_time);
    return rangesOverlap(start, end, wStart, wEnd);
  });
  if (clash) {
    return `This overlaps ${DAY_LABELS[clash.day_of_week]} ${clash.start_time}–${clash.end_time}`;
  }
  return null;
}

/**
 * Validate a blocked-period submission. Both or neither of start/end must be
 * present (blank both = full day); a reason is required; end after start.
 */
export function validateBlock(
  value: { blocked_date: string; start_time: string; end_time: string; reason: string },
): string | null {
  if (!value.blocked_date) return "Pick a date";
  if (!value.reason.trim()) return "A reason is required";
  const hasStart = value.start_time.trim().length > 0;
  const hasEnd = value.end_time.trim().length > 0;
  if (hasStart !== hasEnd) {
    return "Start and end time must be provided together (or both blank for a full day)";
  }
  if (hasStart) {
    const start = clockToMinutes(value.start_time);
    const end = clockToMinutes(value.end_time);
    if (Number.isNaN(start) || Number.isNaN(end)) return "Enter valid times in HH:MM format";
    if (end <= start) return "End time must be after start time";
  }
  return null;
}

/** ISO weekday label for a `day_of_week` integer (0 = Monday). */
export function dayLabel(dayOfWeek: number): string {
  return DAY_LABELS[dayOfWeek] ?? `Day ${dayOfWeek}`;
}

/** `"YYYY-MM-DD"` for a JS Date, in local time. */
export function isoDate(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return isoDate(dt);
}

/** Monday of the week containing `date` (local). */
export function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // Monday = 0
  return isoDate(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - dow));
}

/** `dow` for a `YYYY-MM-DD` string, Monday = 0. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

export function formatDateLong(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const label = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
  return label;
}

/**
 * Build the plain-English read-back summary, e.g.
 * "Dr. X is bookable Mon 08:00–17:00 (GEN), Tue 08:00–15:00; blocked Wed 19 Aug (vacation)".
 */
export function buildReadBack(
  doctorName: string,
  windows: AvailabilityWindow[],
  blockedDays: BlockedDay[],
  departmentName: (id: number | null) => string,
): string {
  const byDay = new Map<number, AvailabilityWindow[]>();
  for (const w of windows) {
    const list = byDay.get(w.day_of_week) ?? [];
    list.push(w);
    byDay.set(w.day_of_week, list);
  }
  const parts: string[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const dayWindows = byDay.get(dow);
    if (!dayWindows) continue;
    for (const w of dayWindows) {
      const dept = w.department_id != null ? ` (${departmentName(w.department_id)})` : "";
      parts.push(`${dayLabel(dow)} ${w.start_time}–${w.end_time}${dept}`);
    }
  }
  const bookable = parts.length
    ? parts.join(", ")
    : "not configured for regular sessions";
  const blockedParts = blockedDays
    .filter((b) => b.blocked_date)
    .map((b) => {
      const range = b.start_time ? ` ${b.start_time}–${b.end_time}` : "";
      return `${formatDateLong(b.blocked_date)}${range} (${b.reason})`;
    });
  const blocked = blockedParts.length ? `; blocked ${blockedParts.join(", ")}` : "";
  return `${doctorName} is bookable ${bookable}${blocked}`;
}