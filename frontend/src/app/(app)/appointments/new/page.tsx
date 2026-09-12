"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  SkeletonRows,
  StateRegion,
  ToastProvider,
  useToast,
  type DataState,
} from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { api, ApiError } from "@/lib/api/client";
import { useQuery, queryKeys, invalidateQueries } from "@/lib/api/queryCache";
import { deptName } from "@/lib/fixtures";
import type { AdminUser, ApiDepartment, Patient, ScheduleSlot } from "@/lib/fixtures";

interface ScheduleResponse {
  doctor_id: number;
  date: string;
  slots: ScheduleSlot[];
}

function slotTime(iso: string): string {
  return iso.slice(11, 16);
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

  const [patientQ, setPatientQ] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [doctorId, setDoctorId] = useState("");
  const [dept, setDept] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const patientSearch = useQuery<{ patients: Patient[] }>(
    queryKeys.patients({ q: patientQ, page: 1, page_size: 6 }),
    {
      fetcher: () =>
        api.get<{ patients: Patient[] }>("/patients", { query: { q: patientQ || undefined, page: 1, page_size: 6 } }),
    },
  );

  const doctors = useQuery<{ users: AdminUser[] }>(queryKeys.users(), {
    fetcher: () => api.get<{ users: AdminUser[] }>("/admin/users", { query: { role: "doctor" } }),
  });

  const depts = useQuery<{ departments: ApiDepartment[] }>(queryKeys.departments(), {
    fetcher: () => api.get<{ departments: ApiDepartment[] }>("/admin/departments"),
  });

  const doctorOptions = useMemo(
    () =>
      (doctors.data?.users ?? []).map((u) => ({
        label: `${u.full_name}${u.specialisation ? ` — ${u.specialisation}` : ""}`,
        value: String(u.id),
      })),
    [doctors.data],
  );

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

  const onSelectDoctor = useCallback((value: string) => {
    setDoctorId(value);
    setTime("");
  }, []);

  const onSubmit = useCallback(async () => {
    if (!selectedPatient || !doctorId || !date || !time) {
      setSubmitError("Choose a patient, doctor, date and a time slot first.");
      return;
    }
    setSubmitting(true);
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
      toast({
        tone: "success",
        message: `Appointment ${created.id} booked`,
        detail: `${selectedPatient.name} · ${doctor?.full_name ?? "Doctor"} · ${date} ${time}`,
      });
      router.push("/appointments");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setSubmitError("Slot is taken — pick another time.");
      } else {
        setSubmitError(e instanceof Error ? e.message : "Could not book the appointment.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [selectedPatient, doctorId, date, time, dept, reason, doctor, router, toast]);

  const scheduleState: DataState = schedule.error
    ? "error"
    : scheduleEnabled && schedule.loading && !schedule.data
      ? "loading"
      : scheduleEnabled && schedule.data && slots.length === 0
        ? "empty"
        : scheduleEnabled
          ? "ready"
          : "empty";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 lg:p-6" data-testid="appointment-booking">
      <header>
        <h1 className="text-2xl font-semibold">Book appointment</h1>
        <p className="mt-1 text-base text-muted">
          Choose a patient, doctor and an open slot — conflicts are caught before you save.
        </p>
      </header>

      {submitError ? (
        <p role="alert" className="rounded-xl border border-danger/50 bg-danger-container p-3.5 text-base font-medium text-danger-container-foreground" data-testid="booking-error">
          {submitError}
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
              <Button variant="ghost" size="sm" onClick={() => setSelectedPatient(null)}>
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
                help="Pick the matching record below."
                renderIcon={renderIcon}
              />
              {patientQ && (patientSearch.data?.patients ?? []).length > 0 ? (
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
            options={[{ label: "Choose a doctor…", value: "" }, ...doctorOptions]}
            value={doctorId}
            onChange={onSelectDoctor}
            renderIcon={renderIcon}
          />
          <Field
            id="booking-dept"
            label="Department"
            type="select"
            options={[{ label: "Choose a department…", value: "" }, ...(depts.data?.departments ?? []).map((d) => ({ label: `${d.code} — ${d.name}`, value: d.code }))]}
            value={dept}
            onChange={setDept}
            renderIcon={renderIcon}
          />
        </div>

        {/* Date + time */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="booking-date" label="Date" type="date" value={date} onChange={(v) => { setDate(v); setTime(""); }} renderIcon={renderIcon} />
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
            variant="primary"
            icon={renderIcon("calendar-check", "h-4 w-4")}
            loading={submitting}
            loadingLabel="Booking…"
            onClick={onSubmit}
            data-testid="book-appointment"
          >
            Book appointment
          </Button>
        </div>
      </div>
    </div>
  );
}