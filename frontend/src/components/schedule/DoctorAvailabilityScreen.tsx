"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  SkeletonRows,
} from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { api, ApiError } from "@/lib/api/client";
import { invalidateQueries, queryKeys, useQuery } from "@/lib/api/queryCache";
import type {
  ApiDepartment,
  AuthUser,
  BlockedDayConflict,
  DoctorAvailability,
  WeekDayData,
} from "@/lib/fixtures";
import {
  DAY_LABELS,
  addDays,
  buildReadBack,
  dayLabel,
  dayOfWeek,
  formatDateLong,
  isoDate,
  validateBlock,
  validateWindow,
  weekStart,
} from "@/lib/schedule";

const HOUR_HEIGHT = 40;

function localMinFromEpoch(epoch: number): number {
  const d = new Date(epoch * 1000);
  return d.getHours() * 60 + d.getMinutes();
}

function slotTime(iso: string): string {
  return iso.slice(11, 16);
}

interface DayTimelineProps {
  day: WeekDayData | undefined;
  windows: DoctorAvailability["windows"];
  selectedDate: string;
  today: string;
  doctorName: string;
  deptCode: (id: number | null) => string;
}

function DayTimeline({ day, windows, selectedDate, today, doctorName, deptCode }: DayTimelineProps) {
  const isToday = selectedDate === today;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // Booking notice: slots strictly before now+15min have passed.
  const cutoffMin = nowMin + 15;

  if (!day) return null;

  if (day.blocked) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-container px-3 py-3 text-warning-container-foreground">
        <span aria-hidden>{renderIcon("ban", "h-4 w-4")}</span>
        <span>This day is fully blocked — no bookable sessions.</span>
      </div>
    );
  }

  if (day.slots.length === 0) {
    return (
      <EmptyState
        icon="calendar-off"
        title="No clinic session on this day"
        body={`${doctorName} has no availability window configured for ${DAY_LABELS[day.day_of_week]}. Add one to make slots bookable.`}
        renderIcon={renderIcon}
      />
    );
  }

  const dow = dayOfWeek(selectedDate);
  const windowBands = windows
    .filter((w) => w.day_of_week === dow)
    .map((w) => {
      const startMin = localMinFromEpoch(epochForClock(selectedDate, w.start_time));
      const endMin = localMinFromEpoch(epochForClock(selectedDate, w.end_time));
      const segments: Array<{ from: number; to: number; state: "passed" | "bookable" }> =
        isToday && cutoffMin > startMin && cutoffMin < endMin
          ? [
              { from: startMin, to: cutoffMin, state: "passed" },
              { from: cutoffMin, to: endMin, state: "bookable" },
            ]
          : [
              {
                from: startMin,
                to: endMin,
                state: isToday && endMin <= cutoffMin ? "passed" : "bookable",
              },
            ];
      return { window: w, segments, startMin, endMin };
    });

  const blockedRuns: Array<{ start: number; end: number; reason: string | null }> = [];
  for (const slot of day.slots) {
    if (slot.status !== "blocked") continue;
    const start = localMinFromEpoch(slot.start_epoch);
    const end = localMinFromEpoch(slot.end_epoch);
    const last = blockedRuns[blockedRuns.length - 1];
    if (last && start === last.end) {
      last.end = end;
      if (slot.reason) last.reason = slot.reason;
    } else {
      blockedRuns.push({ start, end, reason: slot.reason });
    }
  }

  return (
    <div className="relative overflow-x-auto">
      <div className="relative" style={{ height: 24 * HOUR_HEIGHT }}>
        {Array.from({ length: 25 }, (_, h) => (
          <div
            key={h}
            className="absolute left-0 right-0 flex items-start gap-2"
            style={{ top: h * HOUR_HEIGHT - 7 }}
          >
            <span className="num w-11 shrink-0 -translate-y-1/2 text-right text-2xs text-subtle">
              {String(h).padStart(2, "0")}:00
            </span>
            <span className="h-px flex-1 bg-outline" />
          </div>
        ))}

        {/* Bookable window bands */}
        {windowBands.map(({ window: w, segments }) =>
          segments.map((seg, i) => (
            <div
              key={`${w.id}-${i}`}
              data-testid={seg.state === "bookable" ? "bookable-window" : "passed-window"}
              className={
                seg.state === "bookable"
                  ? "absolute left-[52px] right-0 rounded-sm border-l-2 border-primary bg-primary-container/40"
                  : "absolute left-[52px] right-0 rounded-sm border-l-2 border-dashed border-outline bg-surface-2"
              }
              style={{
                top: seg.from * (HOUR_HEIGHT / 60),
                height: (seg.to - seg.from) * (HOUR_HEIGHT / 60),
              }}
            >
              {i === 0 && (
                <span className="absolute left-1 top-0.5 rounded bg-surface-0 px-1 text-2xs font-semibold text-muted">
                  {w.start_time}–{w.end_time}
                  {w.department_id != null ? ` · ${deptCode(w.department_id)}` : ""}
                </span>
              )}
            </div>
          )),
        )}

        {/* Booked slots */}
        {day.slots
          .filter((s) => s.status === "booked")
          .map((s) => (
            <div
              key={s.start_epoch}
              data-testid="booked-slot"
              className="absolute left-[52px] right-0 rounded-sm border-l-2 border-primary bg-primary-container"
              style={{
                top: localMinFromEpoch(s.start_epoch) * (HOUR_HEIGHT / 60),
                height: 15 * (HOUR_HEIGHT / 60),
              }}
            />
          ))}

        {/* Blocked runs with reason */}
        {blockedRuns.map((run, i) => (
          <div
            key={i}
            data-testid="blocked-period"
            className="absolute left-[52px] right-0 overflow-hidden rounded-sm border border-warning/50 bg-warning-container px-1.5 text-warning-container-foreground"
            style={{
              top: run.start * (HOUR_HEIGHT / 60),
              height: Math.max((run.end - run.start) * (HOUR_HEIGHT / 60), 16),
            }}
          >
            <span className="flex items-center gap-1 text-2xs font-semibold">
              <span aria-hidden>{renderIcon("ban", "h-3 w-3")}</span>
              <span>
                {minutesClock(run.start)}–{minutesClock(run.end)} · {run.reason ?? "Blocked"}
              </span>
            </span>
          </div>
        ))}

        {/* Now line: today only */}
        {isToday && (
          <div
            data-testid="now-line"
            className="absolute left-0 right-0 z-10 flex items-center gap-2"
            style={{ top: nowMin * (HOUR_HEIGHT / 60) }}
            aria-hidden="true"
          >
            <span className="num w-11 shrink-0 -translate-y-1/2 text-right text-2xs font-bold text-danger">
              {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
            </span>
            <span className="relative h-0.5 flex-1 bg-danger">
              <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-danger" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Local helper: epoch for a given date + clock, mirroring the mock's `T...:00Z`.
function epochForClock(date: string, clock: string): number {
  return Math.floor(Date.parse(`${date}T${clock}:00Z`) / 1000);
}

function minutesClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface WeekGridProps {
  week: WeekDayData[];
  selectedDate: string;
  today: string;
  onSelect: (date: string) => void;
}

function WeekGrid({ week, selectedDate, today, onSelect }: WeekGridProps) {
  if (week.length === 0) {
    return (
      <EmptyState
        icon="calendar-off"
        title="No week data"
        body="The schedule service returned no days for this range."
        renderIcon={renderIcon}
      />
    );
  }
  return (
    <div className="grid grid-cols-7 gap-2">
      {week.map((d) => {
        const isToday = d.date === today;
        const isSelected = d.date === selectedDate;
        const pct = d.capacity ? Math.round((d.booked / d.capacity) * 100) : 0;
        const hours = (d.capacity * 15) / 60;
        return (
          <button
            key={d.date}
            type="button"
            data-testid="week-day"
            onClick={() => onSelect(d.date)}
            aria-pressed={isSelected}
            className={`w-full rounded-lg border p-2 text-center press ${
              isSelected
                ? "border-primary bg-primary-container"
                : d.blocked
                  ? "border-warning/50 bg-warning-container"
                  : d.capacity
                    ? "border-outline bg-surface-0 hover:bg-surface-2"
                    : "border-outline bg-surface-2 text-subtle"
            }`}
          >
            <span className={`block text-2xs font-semibold ${isToday ? "text-primary" : "text-muted"}`}>
              {DAY_LABELS[d.day_of_week]} {Number(d.date.slice(8))}
              {isToday ? " •" : ""}
            </span>
            {d.blocked ? (
              <span className="mt-1 block text-2xs font-semibold text-warning">Blocked</span>
            ) : (
              <span className="num mt-1 block text-xl font-bold">{d.capacity ? d.booked : "—"}</span>
            )}
            <span className="block text-2xs text-muted">
              {d.capacity ? `${d.booked}/${d.capacity} booked` : "no session"}
            </span>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-3">
              <span
                className={`block h-full rounded-full ${d.blocked ? "bg-warning" : "bg-primary"}`}
                style={{ width: `${d.blocked ? 100 : pct}%` }}
              />
            </span>
            <span className="num mt-1 block text-2xs text-subtle">
              {d.blocked ? "0h" : `${hours}h`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const DAY_OPTIONS = DAY_LABELS.map((label, i) => ({ label, value: String(i) }));

interface Props {
  doctorId: number | string;
}

export function DoctorAvailabilityScreen({ doctorId }: Props) {
  const today = useMemo(() => isoDate(new Date()), []);
  const [view, setView] = useState<"day" | "week">("day");
  const [selectedDate, setSelectedDate] = useState(today);
  const [windowForm, setWindowForm] = useState({
    day_of_week: "0",
    start_time: "08:00",
    end_time: "17:00",
    department_id: "",
  });
  const [windowError, setWindowError] = useState<string | null>(null);
  const [blockForm, setBlockForm] = useState({
    blocked_date: today,
    start_time: "",
    end_time: "",
    reason: "",
  });
  const [blockError, setBlockError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<BlockedDayConflict[] | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const range = useMemo(() => {
    const from = weekStart(selectedDate);
    return { from, to: addDays(from, 6) };
  }, [selectedDate]);

  const avail = useQuery<DoctorAvailability>(
    queryKeys.doctorAvailability(doctorId, range),
    {
      fetcher: () => api.get<DoctorAvailability>(`/doctors/${doctorId}/availability`, { query: range }),
    },
  );
  const doctor = useQuery<AuthUser>(queryKeys.user(doctorId), {
    fetcher: () => api.get<AuthUser>(`/admin/users/${doctorId}`),
  });
  const depts = useQuery<{ departments: ApiDepartment[] }>(queryKeys.departments(), {
    fetcher: () => api.get<{ departments: ApiDepartment[] }>("/admin/departments"),
  });

  const data = avail.data;
  const windows = useMemo(() => data?.windows ?? [], [data]);
  const blockedDays = useMemo(() => data?.blocked_days ?? [], [data]);
  const week = useMemo(() => data?.week ?? [], [data]);
  const selectedDay = useMemo(
    () => week.find((d) => d.date === selectedDate),
    [week, selectedDate],
  );

  const doctorName = doctor.data?.full_name ?? `Doctor #${doctorId}`;
  const deptCode = useCallback(
    (id: number | null) => {
      if (id == null) return "";
      return depts.data?.departments.find((d) => d.id === id)?.code ?? `Dept ${id}`;
    },
    [depts.data],
  );

  const deptOptions = useMemo(
    () => [
      { label: "No department", value: "" },
      ...(depts.data?.departments ?? []).map((d) => ({
        label: `${d.code} — ${d.name}`,
        value: String(d.id),
      })),
    ],
    [depts.data],
  );

  const refresh = useCallback(() => {
    invalidateQueries(queryKeys.doctorAvailability(doctorId) as unknown as unknown[]);
    avail.refetch();
  }, [avail, doctorId]);

  const onSubmitWindow = useCallback(async () => {
    if (!data) return;
    const candidate = {
      day_of_week: Number(windowForm.day_of_week),
      start_time: windowForm.start_time,
      end_time: windowForm.end_time,
      department_id: windowForm.department_id ? Number(windowForm.department_id) : null,
    };
    const err = validateWindow(candidate, windows);
    if (err) {
      setWindowError(err);
      return;
    }
    setSaving(true);
    try {
      const next = [
        ...windows.map((w) => ({
          day_of_week: w.day_of_week,
          start_time: w.start_time,
          end_time: w.end_time,
          department_id: w.department_id,
        })),
        candidate,
      ];
      await api.put(`/doctors/${doctorId}/availability`, { windows: next });
      setWindowError(null);
      setNotice("Window added");
      setWindowForm((f) => ({ ...f, start_time: "08:00", end_time: "17:00", department_id: "" }));
      await refresh();
    } catch (e) {
      setWindowError(e instanceof Error ? e.message : "Could not save window");
    } finally {
      setSaving(false);
    }
  }, [data, windows, windowForm, doctorId, refresh]);

  const onDeleteWindow = useCallback(
    async (id: number) => {
      if (!data) return;
      setSaving(true);
      try {
        const remaining = windows
          .filter((w) => w.id !== id)
          .map((w) => ({
            day_of_week: w.day_of_week,
            start_time: w.start_time,
            end_time: w.end_time,
            department_id: w.department_id,
          }));
        await api.put(`/doctors/${doctorId}/availability`, { windows: remaining });
        setNotice("Window removed");
        await refresh();
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Could not remove window");
      } finally {
        setSaving(false);
      }
    },
    [data, windows, doctorId, refresh],
  );

  const onSubmitBlock = useCallback(async () => {
    const err = validateBlock(blockForm);
    if (err) {
      setBlockError(err);
      return;
    }
    setSaving(true);
    try {
      await api.post(`/doctors/${doctorId}/blocked-days`, {
        blocked_date: blockForm.blocked_date,
        start_time: blockForm.start_time || null,
        end_time: blockForm.end_time || null,
        reason: blockForm.reason,
      });
      setBlockError(null);
      setNotice("Blocked period saved");
      setBlockForm({ blocked_date: today, start_time: "", end_time: "", reason: "" });
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && Array.isArray(e.payload?.conflicts)) {
        setConflicts(e.payload.conflicts as BlockedDayConflict[]);
        setConflictOpen(true);
      } else {
        setBlockError(e instanceof Error ? e.message : "Could not save block");
      }
    } finally {
      setSaving(false);
    }
  }, [blockForm, doctorId, refresh, today]);

  const onDeleteBlock = useCallback(
    async (id: number) => {
      setSaving(true);
      try {
        await api.delete(`/doctors/${doctorId}/blocked-days/${id}`);
        setNotice("Blocked period removed");
        await refresh();
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Could not remove block");
      } finally {
        setSaving(false);
      }
    },
    [doctorId, refresh],
  );

  if (avail.loading && !data) {
    return (
      <div className="p-6" data-testid="availability-loading">
        <SkeletonRows rows={6} columns={4} />
      </div>
    );
  }
  if (avail.error) {
    return (
      <div className="p-6" data-testid="availability-error">
        <ErrorState
          title="Could not load availability"
          body={avail.error.message}
          onRetry={avail.refetch}
          renderIcon={renderIcon}
        />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6 p-6" data-testid="doctor-availability">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Doctor availability</h1>
          <p className="mt-1 text-base text-muted" data-testid="doctor-name">
            {doctorName} · manages weekly working windows and blocked periods
          </p>
        </div>
        {notice && (
          <span className="rounded-full bg-success-container px-3 py-1 text-sm text-success-container-foreground" data-testid="notice">
            {notice}
          </span>
        )}
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
        {/* Views */}
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-outline bg-surface-1 px-3 py-2.5">
            <Button variant="subtle" size="sm" label="Previous week" icon={renderIcon("chevron-left", "h-4 w-4")} onClick={() => setSelectedDate((d) => addDays(d, -7))} data-testid="prev-week" />
            <Button variant="subtle" size="sm" onClick={() => setSelectedDate(today)} data-testid="go-today">
              Today
            </Button>
            <Button variant="subtle" size="sm" label="Next week" icon={renderIcon("chevron-right", "h-4 w-4")} onClick={() => setSelectedDate((d) => addDays(d, 7))} data-testid="next-week" />
            <span className="num text-base font-semibold">{formatDateLong(selectedDate)}</span>
            <span className="flex-1" />
            <div className="flex items-center rounded-lg border border-outline bg-surface-0 p-0.5" role="group" aria-label="Calendar view">
              {(["day", "week"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  data-testid={`view-tab-${v}`}
                  onClick={() => setView(v)}
                  className={`h-8 rounded-md px-3 text-xs font-semibold capitalize press ${
                    view === v ? "bg-primary text-primary-foreground" : "text-muted hover:bg-surface-3"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="card !p-4">
            {view === "day" ? (
              <DayTimeline
                day={selectedDay}
                windows={windows}
                selectedDate={selectedDate}
                today={today}
                doctorName={doctorName}
                deptCode={deptCode}
              />
            ) : (
              <WeekGrid
                week={week}
                selectedDate={selectedDate}
                today={today}
                onSelect={setSelectedDate}
              />
            )}
          </div>

          {/* Blocked periods list */}
          <div className="card !p-4">
            <h2 className="mb-2 text-base font-semibold">Blocked periods</h2>
            {blockedDays.length === 0 ? (
              <p className="text-sm text-muted">No blocked periods for this doctor.</p>
            ) : (
              <ul className="space-y-2">
                {blockedDays.map((b) => (
                  <li key={b.id} className="flex items-center gap-2 text-sm" data-testid="blocked-day">
                    <span className="num font-medium">
                      {formatDateLong(b.blocked_date)}
                      {b.start_time ? ` ${b.start_time}–${b.end_time}` : " · all day"}
                    </span>
                    <span className="flex-1 truncate text-muted">{b.reason}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      label="Remove block"
                      icon={renderIcon("trash-2", "h-4 w-4")}
                      disabled={saving}
                      onClick={() => onDeleteBlock(b.id)}
                      data-testid={`delete-block-${b.id}`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Forms */}
        <aside className="min-w-0 space-y-4">
          {/* Windows list */}
          <section className="card !p-4">
            <h2 className="mb-2 text-base font-semibold">Working windows</h2>
            {windows.length === 0 ? (
              <EmptyState
                icon="calendar-plus"
                title="No working windows"
                body="Add the doctor's regular sessions below to make slots bookable."
                renderIcon={renderIcon}
              />
            ) : (
              <ul className="space-y-1.5" data-testid="window-list">
                {Array.from({ length: 7 }, (_, dow) =>
                  windows
                    .filter((w) => w.day_of_week === dow)
                    .map((w) => (
                      <li key={w.id} className="flex items-center gap-2 text-sm" data-testid="window-row">
                        <span className="num font-medium">{dayLabel(dow)}</span>
                        <span className="num">
                          {w.start_time}–{w.end_time}
                        </span>
                        {w.department_id != null && (
                          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-2xs text-muted">
                            {deptCode(w.department_id)}
                          </span>
                        )}
                        <span className="flex-1" />
                        <Button
                          variant="ghost"
                          size="sm"
                          label="Remove window"
                          icon={renderIcon("trash-2", "h-4 w-4")}
                          disabled={saving}
                          onClick={() => onDeleteWindow(w.id)}
                          data-testid={`delete-window-${w.id}`}
                        />
                      </li>
                    )),
                )}
              </ul>
            )}
          </section>

          {/* Add window */}
          <section className="card !p-4">
            <h2 className="mb-3 text-base font-semibold">Add window</h2>
            <div className="space-y-3">
              <Field
                id="win-day"
                label="Day of week"
                type="select"
                options={DAY_OPTIONS}
                value={windowForm.day_of_week}
                onChange={(v) => setWindowForm((f) => ({ ...f, day_of_week: v }))}
                renderIcon={renderIcon}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="win-start"
                  label="Start"
                  type="time"
                  value={windowForm.start_time}
                  onChange={(v) => setWindowForm((f) => ({ ...f, start_time: v }))}
                  mono
                  renderIcon={renderIcon}
                />
                <Field
                  id="win-end"
                  label="End"
                  type="time"
                  value={windowForm.end_time}
                  onChange={(v) => setWindowForm((f) => ({ ...f, end_time: v }))}
                  mono
                  renderIcon={renderIcon}
                />
              </div>
              <Field
                id="win-dept"
                label="Department"
                type="select"
                options={deptOptions}
                value={windowForm.department_id}
                onChange={(v) => setWindowForm((f) => ({ ...f, department_id: v }))}
                optional
                renderIcon={renderIcon}
              />
              {windowError && (
                <p role="alert" className="text-sm font-medium text-danger" data-testid="window-error">
                  {windowError}
                </p>
              )}
              <Button
                variant="primary"
                icon={renderIcon("plus", "h-4 w-4")}
                loading={saving}
                loadingLabel="Saving…"
                onClick={onSubmitWindow}
                data-testid="add-window"
              >
                Add window
              </Button>
            </div>
          </section>

          {/* Block period */}
          <section className="card !p-4">
            <h2 className="mb-3 text-base font-semibold">Block period</h2>
            <div className="space-y-3">
              <Field
                id="blk-date"
                label="Date"
                type="date"
                value={blockForm.blocked_date}
                onChange={(v) => setBlockForm((f) => ({ ...f, blocked_date: v }))}
                renderIcon={renderIcon}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="blk-start"
                  label="Start (optional)"
                  type="time"
                  value={blockForm.start_time}
                  onChange={(v) => setBlockForm((f) => ({ ...f, start_time: v }))}
                  mono
                  renderIcon={renderIcon}
                />
                <Field
                  id="blk-end"
                  label="End (optional)"
                  type="time"
                  value={blockForm.end_time}
                  onChange={(v) => setBlockForm((f) => ({ ...f, end_time: v }))}
                  mono
                  renderIcon={renderIcon}
                />
              </div>
              <Field
                id="blk-reason"
                label="Reason"
                type="textarea"
                rows={2}
                value={blockForm.reason}
                onChange={(v) => setBlockForm((f) => ({ ...f, reason: v }))}
                placeholder="e.g. Cath lab, teaching round, leave"
                help="Shown to reception so they can explain the gap to patients."
                required
                renderIcon={renderIcon}
              />
              {blockError && (
                <p role="alert" className="text-sm font-medium text-danger" data-testid="block-error">
                  {blockError}
                </p>
              )}
              <Button
                variant="outline"
                icon={renderIcon("calendar-x", "h-4 w-4")}
                loading={saving}
                loadingLabel="Saving…"
                onClick={onSubmitBlock}
                data-testid="add-block"
              >
                Block this period
              </Button>
            </div>
          </section>
        </aside>
      </div>

      {/* Effective access read-back */}
      <section className="card !p-4" data-testid="effective-readback">
        <h2 className="mb-1 text-base font-semibold">Effective availability</h2>
        <p className="text-base leading-relaxed text-muted">
          {buildReadBack(doctorName, windows, blockedDays, deptCode)}
        </p>
      </section>

      <Dialog
        open={conflictOpen}
        title={`This conflicts with ${conflicts?.length ?? 0} appointment(s)`}
        tone="warning"
        size="md"
        onClose={() => setConflictOpen(false)}
        renderIcon={renderIcon}
        actions={[
          {
            label: "Cancel block",
            variant: "ghost",
            onAction: () => {
              setBlockForm({ blocked_date: today, start_time: "", end_time: "", reason: "" });
              setBlockError(null);
            },
          },
          { label: "Edit block", variant: "primary", icon: "pencil-line" },
        ]}
      >
        <p className="mb-3 text-base text-muted">
          Resolve these appointments or adjust the period before saving the block.
        </p>
        <ul className="space-y-2" data-testid="conflict-list">
          {(conflicts ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-lg border border-outline bg-surface-1 px-3 py-2 text-sm">
              <span className="num font-medium text-danger">#{c.id}</span>
              <span className="flex-1 truncate">
                {c.patient_name ?? `Patient ${c.patient_id}`} · {slotTime(c.scheduled_start)}–
                {slotTime(c.scheduled_end)}
              </span>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}

export default DoctorAvailabilityScreen;