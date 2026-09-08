# Hospital Management System — Phase 1 PRD

## Overview

The Hospital Management System is a modular web platform built to run the full clinical and administrative loop of a healthcare provider — from a single-doctor clinic with a handful of patients to a multi-department enterprise hospital with dozens of doctors and thousands of records — without requiring a different product at each stage of growth. The system unifies four chronically painful workflows into one coherent application: it gives every clinician a single, cross-department view of a patient's history instead of scattered per-department charts; it collapses registration into a single guarded intake flow that catches duplicate patients before they're created; it replaces ad-hoc doctor scheduling with conflict-aware booking so double-bookings and no-shift gaps stop happening; and it turns billing and insurance claims into a tracked, auditable workflow instead of a source of silent revenue leakage. The hero of the product is its modularity: every module (Patient, Appointment, Medical Records, Billing, Admin) is independently ownable by a backend domain team, every screen respects a strict role × module permission matrix (Admin, Doctor, Nurse, Receptionist), and every user — regardless of role — gets a personal, drag-and-drop configurable dashboard built from a shared widget library that the hospital admin can globally lock down. This is what lets the same codebase serve a five-patient clinic today and a multi-department hospital tomorrow: capability is additive, not rearchitected.

## Requirements

### Patient Module
- Receptionist-facing patient registration form capturing demographics, contact info, national ID, and emergency contact
- Duplicate-detection check at registration time using national ID exact match and name + date-of-birth fuzzy match, surfaced before a new record is committed
- Patient search across the full patient directory by name, national ID, phone, or MRN (medical record number)
- Patient list view with filters (department, registration date range, doctor)
- Patient detail view showing a single cross-department profile: demographics, active department tags, and a unified activity timeline
- Patient timeline aggregates visits, prescriptions, and billing events across every department the patient has touched — no per-department silos

### Appointment Module
- Appointment booking form (patient, doctor, department, date/time, reason for visit)
- Doctor daily calendar view showing all booked slots for a selected doctor and date
- Conflict detection that blocks a booking when the same doctor is already booked in an overlapping slot
- Availability rules per doctor (working hours, department assignment, blocked-out days)
- Receptionist queue view of today's upcoming appointments

### Medical Records Module
- Visit note entry (chief complaint, diagnosis, clinical notes) tied to an appointment and a doctor
- Prescription entry (medication, dosage, frequency, duration) tied to a visit note
- Attachment upload (lab results, imaging references) attached to a visit note
- Cross-department patient history endpoint aggregating all visit notes, prescriptions, and attachments for a patient regardless of which department created them
- Patient timeline UI rendering the aggregated history in chronological order with department source labels

### Billing Module
- Invoice creation from a completed visit, with line items (consultation, procedures, medication)
- Payment recording against an invoice (partial or full, method, date)
- Insurance claim stub — claim submission record linked to an invoice with payer, claim number, and status
- Payment/claim status workflow (draft, submitted, partially paid, paid, denied) to eliminate silent billing errors
- Billing invoice list and detail views with status filters

### Admin Module
- User management: CRUD on staff accounts, role assignment, department assignment
- Department management: CRUD on departments (name, type, active doctors)
- Role × module permission matrix: every role (Admin, Doctor, Nurse, Receptionist) has an explicit allow/deny per module, enforced server-side
- Widget library governance: admin can globally enable/disable widget types and lock specific widgets so end users cannot remove them from their dashboard

### Cross-cutting (Auth, RBAC, Dashboard Widgets)
- Authentication via Better Auth (email/password login, session management, logout) backed by SQLite/Drizzle
- Role-based access control enforced at the API layer — every endpoint checks the caller's role against the permission matrix before executing
- Modular dashboard widget grid: every user (any role) gets a default widget set on first login, based on their role, and can drag/drop, resize, enable, or disable widgets on their own dashboard
- Per-user widget layout is persisted server-side so it survives across sessions and devices
- Admin-level global widget lock overrides per-user configuration for locked widgets (they cannot be removed or disabled by the end user)

## Architecture

The system is a modular monolith at the API layer and a modular app-router structure on the frontend, split cleanly along the same module boundaries as the backend domains so a team can own Patient, Appointment, Medical Records, Billing, or Admin end-to-end without touching another module's tables. Next.js serves all authenticated pages behind a role-aware shell that reads the current user's permission matrix on login and renders navigation accordingly; FastAPI exposes one router per domain (auth, patient, appointment, medical-records, billing, admin, widget-config), each with its own Pydantic schemas and its own tables in the shared SQLite database via Drizzle migrations. RBAC is enforced twice: the frontend hides UI the role can't use (UX convenience), and every FastAPI route independently re-checks the caller's role against the permission matrix before touching data (the actual security boundary — the frontend check is not trusted). The widget configuration layer sits orthogonal to the clinical modules: it stores a per-user ordered list of enabled widget IDs plus a global lock list maintained by Admin, and the dashboard shell merges "role default widgets" with "user overrides" with "admin locks" (locks always win) at render time.

```mermaid
graph TB
    subgraph "Next.js Frontend (role-aware shell)"
        Shell[App Shell + Role-Based Nav]
        Dash[Modular Widget Dashboard]
        PatientFE[Patient Module UI]
        ApptFE[Appointment Module UI]
        RecordsFE[Medical Records UI]
        BillingFE[Billing Module UI]
        AdminFE[Admin Module UI]
    end

    subgraph "FastAPI Backend (domain routers)"
        AuthAPI[BE-auth: Better Auth + RBAC matrix]
        PatientAPI[BE-patient]
        ApptAPI[BE-appointment]
        RecordsAPI[BE-medical-records]
        BillingAPI[BE-billing]
        AdminAPI[BE-admin]
        WidgetAPI[BE-widget-config]
    end

    subgraph "SQLite / Drizzle"
        DB[(Shared DB: per-module tables)]
    end

    Shell --> AuthAPI
    Dash --> WidgetAPI
    PatientFE --> PatientAPI
    ApptFE --> ApptAPI
    RecordsFE --> RecordsAPI
    BillingFE --> BillingAPI
    AdminFE --> AdminAPI
    AdminFE -.->|global widget lock| WidgetAPI

    AuthAPI -->|RBAC check on every call| PatientAPI
    AuthAPI -->|RBAC check on every call| ApptAPI
    AuthAPI -->|RBAC check on every call| RecordsAPI
    AuthAPI -->|RBAC check on every call| BillingAPI
    AuthAPI -->|RBAC check on every call| AdminAPI
    AuthAPI -->|RBAC check on every call| WidgetAPI

    PatientAPI --> DB
    ApptAPI --> DB
    RecordsAPI --> DB
    BillingAPI --> DB
    AdminAPI --> DB
    WidgetAPI --> DB
    AuthAPI --> DB
```

## DB Schema

### Auth / RBAC tables
- `users` — id, email, password_hash (Better Auth managed), full_name, role (admin/doctor/nurse/receptionist), department_id (nullable, FK departments), active, created_at
- `sessions` — id, user_id (FK users), token, expires_at, created_at (Better Auth managed)
- `permission_matrix` — id, role, module, can_view, can_create, can_edit, can_delete (seeded row per role × module combination)

### Patient tables
- `patients` — id, mrn (unique), full_name, dob, national_id (unique, nullable), phone, address, emergency_contact_name, emergency_contact_phone, created_by (FK users), created_at
- `patient_dedup_flags` — id, patient_id (FK patients), matched_patient_id (FK patients), match_type (national_id/fuzzy_name_dob), resolved (bool), created_at

### Appointment tables
- `appointments` — id, patient_id (FK patients), doctor_id (FK users), department_id (FK departments), scheduled_at, duration_minutes, reason, status (booked/checked_in/completed/cancelled), created_at
- `doctor_availability` — id, doctor_id (FK users), day_of_week, start_time, end_time, department_id (FK departments)
- `doctor_blocked_days` — id, doctor_id (FK users), blocked_date, reason

### Medical Records tables
- `visit_notes` — id, appointment_id (FK appointments), patient_id (FK patients), doctor_id (FK users), chief_complaint, diagnosis, clinical_notes, department_id (FK departments), created_at
- `prescriptions` — id, visit_note_id (FK visit_notes), medication, dosage, frequency, duration_days, created_at
- `attachments` — id, visit_note_id (FK visit_notes), file_name, file_url, uploaded_by (FK users), created_at

### Billing tables
- `invoices` — id, patient_id (FK patients), visit_note_id (FK visit_notes, nullable), total_amount, status (draft/submitted/partially_paid/paid/denied), created_at
- `invoice_line_items` — id, invoice_id (FK invoices), description, amount, item_type (consultation/procedure/medication)
- `payments` — id, invoice_id (FK invoices), amount, method, paid_at
- `insurance_claims` — id, invoice_id (FK invoices), payer_name, claim_number, status (draft/submitted/approved/denied), submitted_at

### Admin tables
- `departments` — id, name, type (general/pediatric/cardiology/emergency), active, created_at
- `department_staff` — id, department_id (FK departments), user_id (FK users), assigned_at

### Widget Config tables
- `widget_definitions` — id, key, name, default_role (which role gets it by default), globally_enabled (bool), globally_locked (bool)
- `user_widget_layout` — id, user_id (FK users), widget_id (FK widget_definitions), position_order, enabled, size

## Tech Stack

- Next.js (App Router) — web frontend, role-aware routing and layout
- FastAPI — backend REST API, one router per domain module
- SQLite — primary datastore for Phase 1, single-file deployment friendly for small clinics
- Drizzle ORM — schema migrations and typed queries against SQLite
- Better Auth — authentication (session-based login/logout, email/password), integrated with the `users`/`sessions` tables
- Material Design 3 (M3) — component design language for consistent UI across modules
- Tailwind CSS — utility-first styling layer implementing the M3 tokens

## User Flow

**Receptionist flow:** A receptionist logs in and lands on a dashboard with the "Today's Registration Queue" and "Today's Appointments" widgets. A new patient walks in; the receptionist opens Patient Registration, enters demographics and national ID, and the system runs duplicate detection in real time — if a national ID or a fuzzy name+DOB match is found, the receptionist is shown the existing record and chooses to link or override before a new patient is created. Once registered, the receptionist opens Appointment Booking, selects a department and doctor, and the doctor's daily calendar shows open slots; picking an already-booked slot is blocked by conflict detection before submission. The appointment appears in the day's queue, and the receptionist can later open Billing to record the patient's payment against the visit's invoice.

**Doctor flow:** A doctor logs in and sees their role-default dashboard: "Today's Schedule," "Pending Records," and "Vitals Queue" widgets (the doctor has previously dragged "Pending Records" to the top of their layout — that customization persists across logins). From the daily schedule, the doctor opens an appointment, reviews the patient's cross-department timeline (including notes and prescriptions from other departments), and enters a new visit note with diagnosis and clinical notes. From the same screen the doctor adds a prescription and attaches a lab result file. The visit note and prescription immediately become visible in the patient's unified timeline, tagged with this department, for any other doctor who later treats the same patient.

**Nurse flow:** A nurse logs in to a dashboard showing "Assigned Patients" and "Vitals Entry" widgets. The nurse selects an assigned patient, records vitals as part of intake ahead of the doctor's visit, and reviews the patient's active care plan drawn from recent visit notes. The nurse's role permissions allow viewing and appending to medical records but not editing billing or admin data — attempts to navigate to those modules are hidden from the nav entirely, and the underlying API would reject the request if attempted directly.

**Admin flow:** An admin logs in to a dashboard with hospital-wide widgets (staff count, department load, billing summary). The admin opens User Management to onboard a new nurse, assigning them a role and a department; the permission matrix instantly governs what that nurse can see on next login. The admin opens Department Management to stand up a new department as the hospital scales, and opens Widget Library Settings to lock the "Today's Schedule" widget so no doctor can remove it from their dashboard, while leaving all other widgets user-configurable.

## Feature Specifications

## Feature: Patient Registration
Receptionist-facing intake form that creates a new patient record with duplicate protection.
## Specification
### Goal
Let front-desk staff register a new patient quickly while preventing duplicate records across departments.
### Definition of Done
- [ ] Registration form captures demographics, national ID, contact, and emergency contact
- [ ] Submitting a valid form creates a patient record with a unique MRN
- [ ] Duplicate detection runs before the record is committed

## Sub-feature: New Patient Intake Form
### Goal
Capture all demographic and contact fields needed to create a patient record in one guided form.
### Definition of Done
- [ ] Form validates required fields (name, DOB, phone) before submit
- [ ] National ID field is optional but validated for format when present
- [ ] Successful submit shows the newly assigned MRN to the receptionist

## Sub-feature: Duplicate Detection
### Goal
Catch duplicate patients at the point of registration instead of after they've fragmented a patient's history.
### Definition of Done
- [ ] Exact national ID match blocks silent creation and surfaces the existing record
- [ ] Fuzzy name + DOB match surfaces a "possible duplicate" warning with a link/override choice
- [ ] Receptionist can explicitly override and create a new record when the match is a false positive

## Feature: Patient Search & Directory
Directory-wide search and filtering across all registered patients.
## Specification
### Goal
Let any clinical or front-desk role find an existing patient in seconds regardless of which department registered them.
### Definition of Done
- [ ] Search returns results by name, national ID, phone, or MRN
- [ ] Patient list supports filtering by department and registration date range

## Sub-feature: Quick Search
### Goal
Instant, typeahead-style lookup for the common case of finding one known patient.
### Definition of Done
- [ ] Typing 3+ characters returns matching patients within the directory
- [ ] Results show name, MRN, and last visit department for disambiguation

## Sub-feature: Advanced Filters
### Goal
Let staff narrow the patient list by structured criteria instead of free text.
### Definition of Done
- [ ] Filter by department returns only patients with activity in that department
- [ ] Filter by registration date range narrows the list accordingly
- [ ] Filters are combinable (department + date range together)

## Feature: Patient Profile & Cross-Department History
Single patient profile aggregating activity from every department.
## Specification
### Goal
Replace scattered per-department charts with one canonical patient view.
### Definition of Done
- [ ] Patient detail page shows demographics, department tags, and a unified timeline
- [ ] Timeline entries are sourced from visits across all departments, not just the current one

## Sub-feature: Unified Timeline View
### Goal
Show a chronological feed of every clinical and billing touchpoint for a patient.
### Definition of Done
- [ ] Timeline merges visit notes, prescriptions, and billing events in date order
- [ ] Each entry is labeled with its originating department

## Sub-feature: Department Tagging
### Goal
Make it visible at a glance which departments a patient has been treated in.
### Definition of Done
- [ ] Patient profile header lists all departments the patient has an appointment or visit note in
- [ ] Tags update automatically as new cross-department activity occurs

## Feature: Appointment Booking
Booking flow for scheduling a patient with a doctor.
## Specification
### Goal
Let front-desk staff schedule a patient/doctor appointment without creating scheduling conflicts.
### Definition of Done
- [ ] Booking form creates an appointment tied to patient, doctor, department, and time slot
- [ ] Doctor's daily calendar reflects the new booking immediately

## Sub-feature: Booking Form
### Goal
Capture the minimum fields needed to schedule a valid appointment.
### Definition of Done
- [ ] Form requires patient, doctor, department, date/time, and reason for visit
- [ ] Submitting an invalid or incomplete form blocks booking with a clear error

## Sub-feature: Doctor Daily Calendar View
### Goal
Give staff a visual read of a doctor's booked and open slots for a given day.
### Definition of Done
- [ ] Calendar shows all booked appointments for the selected doctor and date
- [ ] Open slots are visually distinct from booked slots

## Feature: Conflict Detection & Scheduling Rules
Server-enforced rules preventing double-booking and out-of-hours scheduling.
## Specification
### Goal
Eliminate double-booking and no-shift scheduling chaos entirely at the data layer, not just the UI.
### Definition of Done
- [ ] Overlapping bookings for the same doctor are rejected server-side
- [ ] Bookings outside a doctor's configured availability are rejected

## Sub-feature: Double-Booking Prevention
### Goal
Guarantee a doctor can never be booked into two overlapping appointments.
### Definition of Done
- [ ] Booking API rejects a new appointment that overlaps an existing one for the same doctor
- [ ] Rejection returns a clear conflict error identifying the clashing appointment

## Sub-feature: Availability Rules Engine
### Goal
Constrain bookings to a doctor's actual working hours and days.
### Definition of Done
- [ ] Doctor availability (day/time windows) is configurable per doctor
- [ ] Booking outside configured hours or on a blocked-out day is rejected

## Feature: Visit Notes & Prescriptions
Clinical documentation captured during and after a patient visit.
## Specification
### Goal
Give doctors a fast way to document diagnosis, notes, and prescriptions tied to a specific visit.
### Definition of Done
- [ ] Visit note is created against an appointment with chief complaint, diagnosis, and notes
- [ ] Prescriptions can be added to a visit note with medication, dosage, frequency, duration

## Sub-feature: Visit Note Entry
### Goal
Let a doctor document a visit in one screen without leaving the appointment context.
### Definition of Done
- [ ] Visit note form is pre-linked to the current appointment and patient
- [ ] Saved visit note appears immediately in the patient's timeline

## Sub-feature: Prescription Management
### Goal
Attach structured prescription records to a visit for pharmacy and history purposes.
### Definition of Done
- [ ] Prescription form requires medication, dosage, frequency, and duration
- [ ] Multiple prescriptions can be attached to a single visit note

## Feature: Patient Timeline (Cross-Department)
Aggregated clinical history view spanning all departments.
## Specification
### Goal
Solve the "scattered medical records" pain point with one authoritative history endpoint and view.
### Definition of Done
- [ ] History endpoint aggregates visit notes, prescriptions, and attachments across all departments for a patient
- [ ] Timeline UI renders the aggregate in chronological order with department labels

## Sub-feature: Aggregated History Endpoint
### Goal
Provide a single API that returns a patient's full clinical history regardless of department.
### Definition of Done
- [ ] Endpoint returns visit notes, prescriptions, and attachments joined by patient_id
- [ ] Results are sorted chronologically and paginated for patients with long histories

## Sub-feature: Attachment Handling
### Goal
Let doctors attach supporting files (labs, imaging) to a visit note.
### Definition of Done
- [ ] Visit note supports one or more file attachments
- [ ] Attachments are retrievable from the patient timeline, not just the originating visit

## Feature: Invoice Management
Invoice creation and payment tracking for completed visits.
## Specification
### Goal
Turn billing into a tracked, auditable workflow instead of an ad-hoc process prone to errors.
### Definition of Done
- [ ] Invoice can be created from a completed visit with line items
- [ ] Payments can be recorded against an invoice, partial or full

## Sub-feature: Invoice Creation & Line Items
### Goal
Generate a structured invoice with itemized charges tied to a visit.
### Definition of Done
- [ ] Invoice supports multiple line items (consultation, procedure, medication)
- [ ] Invoice total is computed automatically from line items

## Sub-feature: Payment Recording
### Goal
Track money actually collected against an invoice over time.
### Definition of Done
- [ ] Payment entry records amount, method, and date against an invoice
- [ ] Invoice status updates automatically based on cumulative payments (partially_paid/paid)

## Feature: Insurance Claims
Claim submission and status tracking against invoices.
## Specification
### Goal
Reduce insurance claim errors that erode margin by tracking claim status explicitly instead of informally.
### Definition of Done
- [ ] Claim can be submitted against an invoice with payer and claim number
- [ ] Claim status is tracked through its lifecycle (draft/submitted/approved/denied)

## Sub-feature: Claim Submission Stub
### Goal
Capture the minimum data needed to represent a submitted insurance claim.
### Definition of Done
- [ ] Claim form requires payer name and links to an invoice
- [ ] Submitted claim is visible from the invoice detail view

## Sub-feature: Claim Status Tracking
### Goal
Make claim outcome visible so billing staff can follow up on denials.
### Definition of Done
- [ ] Claim status can be updated (submitted, approved, denied)
- [ ] Denied claims are visually flagged on the billing list view

## Feature: User & Role Management
Admin CRUD over staff accounts and role assignment.
## Specification
### Goal
Let the hospital admin manage who has access to the system and what they can do.
### Definition of Done
- [ ] Admin can create, edit, deactivate staff accounts
- [ ] Admin can assign a role and department to each user

## Sub-feature: User CRUD
### Goal
Full lifecycle management of staff accounts.
### Definition of Done
- [ ] Admin can create a user with name, email, role, and department
- [ ] Admin can edit or deactivate an existing user

## Sub-feature: Role Assignment & Permission Matrix
### Goal
Bind each user to a role that deterministically governs their module access.
### Definition of Done
- [ ] Assigning a role to a user immediately governs their nav and API access
- [ ] Permission matrix (role × module) is viewable and editable by admin

## Feature: Department Management
Admin CRUD over hospital departments.
## Specification
### Goal
Let the hospital admin model its actual department structure as it scales.
### Definition of Done
- [ ] Admin can create, edit, and deactivate departments
- [ ] Department list reflects active doctor assignments

## Sub-feature: Department CRUD
### Goal
Manage the set of departments the hospital operates.
### Definition of Done
- [ ] Admin can create a department with name and type
- [ ] Admin can edit or deactivate a department

## Sub-feature: Department-Staff Mapping
### Goal
Track which staff are assigned to which department.
### Definition of Done
- [ ] Admin can assign a user to one or more departments
- [ ] Department detail view lists its assigned staff

## Feature: Widget Library Governance
Admin-level control over which dashboard widgets exist and which are locked.
## Specification
### Goal
Give the hospital admin global control over the widget library so critical widgets can't be disabled by end users.
### Definition of Done
- [ ] Admin can globally enable/disable a widget type across the hospital
- [ ] Admin can lock a widget so individual users cannot remove or disable it

## Sub-feature: Global Widget Enable/Disable
### Goal
Control which widgets exist as options at all, hospital-wide.
### Definition of Done
- [ ] Disabling a widget globally removes it from every user's available widget list
- [ ] Re-enabling restores it as an option without deleting prior user layouts

## Sub-feature: Widget Locking
### Goal
Force-pin specific widgets onto user dashboards regardless of personal preference.
### Definition of Done
- [ ] Locked widget cannot be removed or disabled from a user's own dashboard settings
- [ ] Locked state is visibly indicated to the end user

## Feature: Authentication & RBAC
Login, session management, and server-side permission enforcement.
## Specification
### Goal
Secure the system with role-based access that's enforced at the API layer, not just hidden in the UI.
### Definition of Done
- [ ] Users can log in, stay authenticated via session, and log out
- [ ] Every API endpoint enforces the permission matrix for the caller's role

## Sub-feature: Better Auth Login/Session
### Goal
Provide secure email/password authentication with session persistence.
### Definition of Done
- [ ] Login issues a valid session on correct credentials
- [ ] Invalid credentials are rejected with a generic error (no user enumeration)
- [ ] Session expires and requires re-authentication after configured TTL

## Sub-feature: Permission Matrix Enforcement
### Goal
Make role-based restrictions a real security boundary, not a UI convenience.
### Definition of Done
- [ ] Every module API checks the caller's role against the permission matrix before executing
- [ ] Unauthorized requests are rejected with 403, regardless of frontend state

## Feature: Modular Dashboard Widgets
Configurable widget grid dashboard for every role.
## Specification
### Goal
Give every user a dashboard tailored to their role by default, and fully configurable by them afterward.
### Definition of Done
- [ ] Each role gets a sensible default widget set on first login
- [ ] Users can drag/drop, resize, enable, and disable widgets on their own dashboard

## Sub-feature: Role-Based Default Layout
### Goal
Ensure every user starts with a dashboard relevant to their job on day one.
### Definition of Done
- [ ] Doctor default includes Today's Schedule, Pending Records, Vitals Queue
- [ ] Receptionist default includes Today's Appointments, Registration Queue
- [ ] Nurse and Admin each have their own sensible default set

## Sub-feature: Per-User Drag & Drop Persistence
### Goal
Let each user's dashboard customization survive across sessions and devices.
### Definition of Done
- [ ] Widget reorder/resize/enable/disable actions persist to the backend
- [ ] Reloading the dashboard on any device reflects the saved layout
- [ ] Admin-locked widgets remain fixed even after a user's layout is saved


---

## Document References

- **Notion page**: https://app.notion.com/p/Hospital-Management-System-Phase-1-PRD-3d58f6b0a7a581929041eb7f4597fe0e
- **GitHub repository**: https://github.com/arkinara/hospital-management-system
- **GitHub Project board**: https://github.com/users/arkinara/projects/16
- **Tickets**: https://github.com/arkinara/hospital-management-system/issues
