"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  SkeletonRows,
  StateRegion,
  StatusChip,
  ToastProvider,
  useToast,
  type Column,
  type DataState,
} from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { api, ApiError } from "@/lib/api/client";
import { useQuery, queryKeys, invalidateQueries } from "@/lib/api/queryCache";
import { byDoctor, deptName, doctors as fixtureDoctors, TODAY } from "@/lib/fixtures";
import type { AdminUser, ApiDepartment, Appointment, Patient, ScheduleSlot } from "@/lib/fixtures";

interface ScheduleResponse {
  doctor_id: number;
  date: string;
  slots: ScheduleSlot[];
}

type BookingMode = "book" | "sms" | "checkin";
type TabId = "book" | "queue";

function slotTime(iso: string): string {
  return iso.slice(11, 16);
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function AppointmentBookingPage() {
  return (
    <ToastProvider renderIcon={renderIcon}>
      <BookingForm />
    </ToastProvider>
  );
}

function BookingForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabId>("book");

  const [patientQ, setPatientQ] = useState("");
  const debouncedPatientQ = useDebounced(patientQ, 200);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [doctorId, setDoctorId] = useState("");
  const [dept, setDept] = useState("");
  const [date, setDate] = useState(() => TODAY);
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState<BookingMode | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [queueDoctor, setQueueDoctor] = useState("");

  const patientSearch = useQuery<{ patients: Patient[] }>(
    ["patients", "search", debouncedPatientQ],
    {
      fetcher: () =>
        api.get<{ patients: Patient[] }>("/patients", {
          query: { q: debouncedPatientQ || undefined, page: 1, page_size: 6 },
        }),
      enabled: debouncedPatientQ.length > 0,
    },
  );

  const doctors = useQuery<{ users: AdminUser[] }>(queryKeys.users(), {
    fetcher: () => api.get<{ users: AdminUser[] }>("/admin/users", { query: { role: "doctor" } }),
  });

  const depts = useQuery<{ departments: ApiDepartment[] }>(queryKeys.departments(), {
    fetcher: () => api.get<{ departments: ApiDepartment[] }>("/admin/departments"),
  });

  // Department narrows the doctor dropdown; a doctor with a different dept is reset.
  const doctorOptions = useMemo(() => {
    const users = doctors.data?.users ?? [];
    return users
      .filter((u) => !dept || u.department_id === (depts.data?.departments ?? []).find((d) => d.code === dept)?.id)
      .map((u) => ({
        label: `${u.full_name}${u.specialisation ? ` — ${u.specialisation}` : ""}`,
        value: String(u.id),
      }));
  }, [doctors.data, depts.data, dept]);

  const doctor = useMemo(
    () => (doctors.data?.users ?? []).find((u) => String(u.id) === doctorId),
    [doctors.data, doctorId],
  );

  const scheduleEnabled = Boolean(doctorId && date);
  const schedule = useQuery<ScheduleResponse>(queryKeys.doctorSchedule(doctorId, date), {
    fetcher: () => api.get<ScheduleResponse>(`/doctors/${doctorId}/schedule`, { query: { date } }),
    enabled: scheduleEnabled,
  });

  // When the doctor changes, pre-fill the department with theirs.
  useEffect(() => {
    if (doctor && doctor.department_id != null) {
      const code = (depts.data?.departments ?? []).find((d) => d.id === doctor.department_id)?.code;
      if (code) setDept(code);
    }
  }, [doctor, depts.data]);

  const slots = schedule.data?.slots ?? [];
  const freeSlots = slots.filter((s) => s.status === "free");
  const dayBlocked = scheduleEnabled && !schedule.loading && schedule.data && slots.length === 0;

  // Conflict detection: the chosen slot must still be free in the freshest data.
  const selectedSlot = useMemo(
    () => slots.find((s) => slotTime(s.start) === time),
    [slots, time],
  );

  useEffect(() => {
    if (time && selectedSlot && selectedSlot.status !== "free") {
      setConflictWarning(
        selectedSlot.status === "booked"
          ? "That slot is already taken. Pick another time before booking."
          : "That slot is blocked. Pick another time before booking.",
      );
    } else {
      setConflictWarning(null);
    }
  }, [time, selectedSlot]);

  // Today's queue tab
  const queue = useQuery<{ appointments: Appointment[] }>(
    ["appointments", "today", TODAY, queueDoctor],
    {
      fetcher: () =>
        api.get<{ appointments: Appointment[] }>("/appointments", {
          query: { date: TODAY, doctor_id: queueDoctor || undefined },
        }),
    },
  );
  const queueRows = useMemo(
    () =>
      [...(queue.data?.appointments ?? [])].sort((a, b) => a.time.localeCompare(b.time)),
    [queue.data],
  );
  const queueState: DataState = queue.error
    ? "error"
    : queue.loading && !queue.data
      ? "loading"
      : queueRows.length === 0
        ? "empty"
        : "ready";

  const onSelectDoctor = useCallback((value: string) => {
    setDoctorId(value);
    setTime("");
    setConflictWarning(null);
  }, []);

  const onSelectDept = useCallback((value: string) => {
    setDept(value);
    setDoctorId("");
    setTime("");
    setConflictWarning(null);
  }, []);

  const onSubmit = useCallback(
    async (mode: BookingMode) => {
      if (!selectedPatient || !doctorId || !date || !time) {
        setSubmitError("Choose a patient, doctor, date and a time slot first.");
        return;
      }
      if (conflictWarning) {
        setSubmitError(conflictWarning);
        return;
      }
      setSubmitting(mode);
      setSubmitError(null);
      try {
        const created = await api.post<{ id: string }>("/appointments", {
          patient_id: selectedPatient.mrn,
          doctor_id: Number(doctorId),
          dept: dept || undefined,
          date,
          time,
          reason: reason || "Consultation",
        });
        invalidateQueries(queryKeys.appointments() as unknown as unknown[]);
        const detail = `${selectedPatient.name} · ${doctor?.full_name ?? "Doctor"} · ${date} ${time}`;
        if (mode === "sms") {
          toast({
            tone: "success",
            message: `Appointment ${created.id} booked`,
            detail: `${detail} — SMS confirmation sent to ${selectedPatient.phone}`,
          });
        } else if (mode === "checkin") {
          await api.post(`/appointments/${created.id}/check-in`);
          invalidateQueries(queryKeys.appointments() as unknown as unknown[]);
          toast({
            tone: "success",
            message: `Appointment ${created.id} booked and checked in`,
            detail: `${selectedPatient.name} is now checked in.`,
          });
        } else {
          toast({ tone: "success", message: `Appointment ${created.id} booked`, detail });
        }
        router.push("/appointments");
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          setSubmitError("Slot is taken — pick another time.");
          setConflictWarning("That slot was just taken. Pick another time before booking.");
        } else {
          setSubmitError(e instanceof Error ? e.message : "Could not book the appointment.");
        }
      } finally {
        setSubmitting(null);
      }
    },
    [selectedPatient, doctorId, date, time, dept, reason, doctor, router, toast, conflictWarning],
  );

  const scheduleState: DataState = schedule.error
    ? "error"
    : scheduleEnabled && schedule.loading && !schedule.data
      ? "loading"
      : scheduleEnabled && schedule.data && slots.length === 0
        ? "empty"
        : scheduleEnabled
          ? "ready"
          : "empty";

  const queueColumns: Column<Appointment>[] = [
    { key: "id", label: "ID", mono: true, cell: (a) => <span className="num font-semibold">{a.id}</span> },
    { key: "time", label: "Time", mono: true, cell: (a) => <span className="num">{a.time}</span> },
    {
      key: "patient",
      label: "Patient",
      cell: (a) => <span className="num">{a.patient}</span>,
    },
    { key: "doctor", label: "Doctor", cell: (a) => byDoctor(a.doctor).name },
    { key: "reason", label: "Reason", cell: (a) => <span className="text-muted">{a.reason}</span> },
    {
      key: "status",
      label: "Status",
      width: "9rem",
      cell: (a) => <StatusChip status={a.status} renderIcon={renderIcon} />,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 lg:p-6" data-testid="appointment-booking">
      <header>
        <h1 className="text-2xl font-semibold">Book appointment</h1>
        <p className="mt-1 text-base text-muted">
          Front-desk booking — pick a patient, doctor and slot; conflicts are caught before you save.
        </p>
      </header>

      <div
        className="flex flex-wrap items-center gap-1 rounded-xl border border-outline bg-surface-1 p-1"
        role="tablist"
        aria-label="Booking workspace"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "book"}
          onClick={() => setTab("book")}
          className="press inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-base font-medium data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
          data-active={tab === "book"}
        >
          {renderIcon("calendar-plus", "h-4 w-4")}
          Book
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "queue"}
          onClick={() => setTab("queue")}
          className="press inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-base font-medium data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
          data-active={tab === "queue"}
        >
          {renderIcon("list-checks", "h-4 w-4")}
          Today&apos;s appointments
        </button>
      </div>

      {tab === "book" ? (
        <>
          {submitError ? (
            <p
              role="alert"
              className="rounded-xl border border-danger/50 bg-danger-container p-3.5 text-base font-medium text-danger-container-foreground"
              data-testid="booking-error"
            >
              {submitError}
            </p>
          ) : null}

          {conflictWarning ? (
            <p
              role="alert"
              className="rounded-xl border border-danger/50 bg-danger-container p-3.5 text-base font-medium text-danger-container-foreground"
              data-testid="conflict-warning"
            >
              {renderIcon("alert-triangle", "mr-1.5 inline h-4 w-4 align-[-2px]")}
              {conflictWarning}
            </p>
          ) : null}

          <div className="card space-y-5 !p-4">
            {/* Patient */}
            <section aria-label="Patient">
              <h2 className="mb-2 text-base font-semibold">Patient</h2>
              {selectedPatient ? (
                <div className="flex items-center gap-2 rounded-lg border border-outline bg-surface-1 p-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-container text-primary-container-foreground">
                    {selectedPatient.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium">{selectedPatient.name}</p>
                    <p className="num text-2xs text-muted">
                      {selectedPatient.mrn} · {selectedPatient.dob} · {deptName(selectedPatient.dept)}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedPatient(null); setPatientQ(""); }}>
                    Change
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Field
                    id="patient-search"
                    label="Search patient"
                    type="search"
                    icon="search"
                    value={patientQ}
                    onChange={setPatientQ}
                    placeholder="Name or MRN…"
                    help="Type to search — results update as you type."
                    renderIcon={renderIcon}
                  />
                  {debouncedPatientQ && (patientSearch.data?.patients ?? []).length > 0 ? (
                    <ul className="divide-y divide-outline overflow-hidden rounded-lg border border-outline">
                      {(patientSearch.data?.patients ?? []).slice(0, 6).map((p) => (
                        <li key={p.mrn}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPatient(p);
                              setPatientQ("");
                            }}
                            className="press flex min-h-12 w-full items-center gap-2 px-3 text-left hover:bg-surface-2"
                          >
                            <span className="num font-semibold">{p.mrn}</span>
                            <span className="flex-1">{p.name}</span>
                            <span className="text-2xs text-muted">{p.dob}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : debouncedPatientQ && !patientSearch.loading && (patientSearch.data?.patients ?? []).length === 0 ? (
                    <p className="text-base text-muted">No patient matches “{debouncedPatientQ}”.</p>
                  ) : null}
                </div>
              )}
            </section>

            {/* Doctor + department */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="booking-doctor"
                label="Doctor"
                type="select"
                options={[{ label: dept ? "Choose a doctor…" : "Choose a doctor…", value: "" }, ...doctorOptions]}
                value={doctorId}
                onChange={onSelectDoctor}
                help={dept && doctorOptions.length === 0 ? "No doctors available in this department." : undefined}
                renderIcon={renderIcon}
              />
              <Field
                id="booking-dept"
                label="Department"
                type="select"
                options={[{ label: "All departments", value: "" }, ...(depts.data?.departments ?? []).map((d) => ({ label: `${d.code} — ${d.name}`, value: d.code }))]}
                value={dept}
                onChange={onSelectDept}
                renderIcon={renderIcon}
              />
            </div>
            {dept && doctorOptions.length === 0 ? (
              <p role="status" className="rounded-lg border border-outline bg-surface-1 p-3 text-base text-muted" data-testid="no-doctors">
                No doctors available in {deptName(dept)}. Pick another department.
              </p>
            ) : null}

            {/* Date + time */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="booking-date" label="Date" type="date" value={date} onChange={(v) => { setDate(v); setTime(""); setConflictWarning(null); }} renderIcon={renderIcon} />
              {time ? (
                <Field
                  id="booking-time"
                  label="Time"
                  type="time"
                  value={time}
                  readOnly
                  help={`Selected slot ${time}`}
                  renderIcon={renderIcon}
                />
              ) : null}
            </div>

            {/* Available slots / conflict detection */}
            <section aria-label="Available slots">
              <h2 className="mb-2 text-base font-semibold">
                {doctor ? `${doctor.full_name.split(" ")[0] ?? doctor.full_name}'s slots` : "Available slots"}
                {date ? ` on ${date}` : ""}
              </h2>
              {!doctorId ? (
                <p className="text-base text-muted">Pick a doctor to see their open slots.</p>
              ) : (
                <StateRegion
                  state={scheduleState}
                  loading={<SkeletonRows rows={3} columns={4} />}
                  empty={
                    dayBlocked || !schedule.data ? (
                      <EmptyState
                        icon="calendar-x"
                        title={doctor ? `Dr. ${doctor.full_name.replace("Dr. ", "").split(" ")[0]} is unavailable on ${date}` : "No slots"}
                        body="This doctor has no bookable session on this date. Pick another date or doctor."
                        renderIcon={renderIcon}
                      />
                    ) : (
                      <EmptyState
                        icon="calendar-search"
                        title="Choose a doctor and date"
                        body="Slots will appear here once a doctor and a date are selected."
                        renderIcon={renderIcon}
                      />
                    )
                  }
                  error={
                    <ErrorState
                      title="Could not load this doctor's schedule"
                      body={schedule.error?.message ?? "The schedule service did not respond."}
                      onRetry={schedule.refetch}
                      renderIcon={renderIcon}
                    />
                  }
                  ready={
                    <div className="space-y-2">
                      {freeSlots.length === 0 ? (
                        <p className="text-base text-muted">No open slots on this day.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Open appointment slots">
                          {slots.map((s) => {
                            const taken = s.status !== "free";
                            return (
                              <button
                                key={s.start_epoch}
                                type="button"
                                disabled={taken}
                                aria-pressed={time === slotTime(s.start)}
                                onClick={() => setTime(slotTime(s.start))}
                                title={taken ? (s.status === "booked" ? "Slot is taken" : s.reason ?? "Blocked") : "Open slot"}
                                className={`press inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-base font-medium ${
                                  taken
                                    ? "cursor-not-allowed border-outline bg-surface-2 text-subtle"
                                    : time === slotTime(s.start)
                                      ? "border-transparent bg-primary text-primary-foreground"
                                      : "border-outline-strong bg-surface-0 hover:bg-surface-2"
                                }`}
                              >
                                {taken ? renderIcon("lock", "h-3.5 w-3.5") : renderIcon("circle", "h-3.5 w-3.5")}
                                <span className="num">{slotTime(s.start)}</span>
                                {taken ? <span className="text-2xs">{s.status === "booked" ? "taken" : "blocked"}</span> : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <p className="text-xs text-muted">
                        Locked slots are already booked or blocked —{" "}
                        {doctor ? `Dr. ${doctor.full_name.replace("Dr. ", "")} ` : "the doctor "}cannot take them.
                      </p>
                    </div>
                  }
                />
              )}
            </section>

            <Field
              id="booking-reason"
              label="Reason"
              type="textarea"
              rows={2}
              value={reason}
              onChange={setReason}
              placeholder="e.g. Hypertension review, wound dressing…"
              optional
              renderIcon={renderIcon}
            />

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => router.push("/appointments")}>
                Cancel
              </Button>
              <Button
                variant="outline"
                icon={renderIcon("message-square", "h-4 w-4")}
                loading={submitting === "sms"}
                loadingLabel="Booking…"
                onClick={() => onSubmit("sms")}
                data-testid="book-sms"
              >
                Book + send SMS
              </Button>
              <Button
                variant="outline"
                icon={renderIcon("log-in", "h-4 w-4")}
                loading={submitting === "checkin"}
                loadingLabel="Booking…"
                onClick={() => onSubmit("checkin")}
                data-testid="book-checkin"
              >
                Book + check in
              </Button>
              <Button
                variant="primary"
                icon={renderIcon("calendar-check", "h-4 w-4")}
                loading={submitting === "book"}
                loadingLabel="Booking…"
                onClick={() => onSubmit("book")}
                data-testid="book-appointment"
              >
                Book appointment
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="card space-y-4 !p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Today&apos;s appointments</h2>
              <p className="mt-0.5 text-xs text-muted">
                {queueRows.length > 0 ? `${queueRows.length} booked for ${TODAY}` : "The day queue is live"}
              </p>
            </div>
            <div className="w-56">
              <Field
                id="queue-doctor"
                label="Doctor"
                type="select"
                options={[
                  { label: "All doctors", value: "" },
                  ...fixtureDoctors.map((d) => ({ label: d.name, value: d.id })),
                ]}
                value={queueDoctor}
                onChange={setQueueDoctor}
                renderIcon={renderIcon}
              />
            </div>
          </div>

          <StateRegion
            state={queueState}
            loading={<SkeletonRows rows={6} columns={4} />}
            empty={
              <EmptyState
                icon="calendar-x"
                title="No appointments yet today"
                body="Book the first appointment and it will appear here as the day's queue."
                renderIcon={renderIcon}
              />
            }
            error={
              <ErrorState
                title="Could not load today's queue"
                body={queue.error?.message ?? "The appointment service did not respond."}
                onRetry={queue.refetch}
                renderIcon={renderIcon}
              />
            }
            ready={
              <div className="overflow-hidden rounded-lg border border-outline">
                <DataTable
                  rows={queueRows}
                  columns={queueColumns}
                  rowKey={(a) => a.id}
                  label="Today's appointments"
                  caption={`Appointments for ${TODAY}, sorted by time`}
                  rowLabel={(a) => `${a.id} — ${a.patient} at ${a.time}`}
                  initialSort={{ key: "time", dir: "asc" }}
                  onRowActivate={(a) => router.push(`/appointments/${a.id}`)}
                  renderIcon={renderIcon}
                  mobileCard={(a) => (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num font-semibold">{a.time}</span>
                      <span className="num text-muted">{a.patient}</span>
                      <span className="flex-1 truncate text-muted">{a.reason}</span>
                      <StatusChip status={a.status} renderIcon={renderIcon} />
                    </div>
                  )}
                />
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}