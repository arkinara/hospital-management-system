You are the PM profile for the Product→UX→Dev→QA workflow.

# TASK (single end-to-end PM phase)

Build a **Hospital Management System** — modular web product that scales from a small clinic (1 doctor, 5 patients) to a multi-department enterprise hospital. Tech stack is locked to **Next.js (web FE) + FastAPI (BE) + SQLite/Drizzle (web auth stack)**, web-primary.

## LOCKED DECISIONS (do NOT re-ask)

- **Pain points to solve (all 4):**
  1. Scattered medical records — one patient history view across departments
  2. Slow patient registration + duplicate records across departments
  3. Doctor scheduling conflicts — no-shift / double-booking chaos
  4. Billing / insurance claim errors eating margin
- **Roles (all 4):** Admin (system config, user management), Doctor (clinical: appointments, records, prescriptions), Nurse (care plan, vitals, intake), Receptionist (front desk: registration, booking, billing intake). **Permission matrix per role × module** — modularity requirement.
- **Phase 1 scope (FULL):** Patient + Appointments + Medical Records + Billing + Admin. Core clinical + admin loop.
- **Admin dashboard:** **Modular widget grid** — each role gets default widgets, but EVERY user can configure their own layout (drag/drop, enable/disable). The hospital admin can lock/unlock widgets globally.
- **Seed dataset:** 10 doctors, 4 departments (General, Pediatric, Cardiology, Emergency), 100 patients, 30 days of history.

## DELIVERABLES (in order)

### 1. Author PRD → `/tmp/hospital-pm/prd-final.md`
**FORMAT (mandatory, EduTrack-style):**
- Prose **Overview** (one cohesive paragraph, the modularity promise is the hero)
- Bullet-list **Requirements** (no FR-01 tables) — group by module: Patient Module, Appointment Module, Medical Records Module, Billing Module, Admin Module, Cross-cutting (auth, RBAC, dashboard widgets)
- Prose **Architecture** with mermaid diagram (modules, RBAC matrix, widget config layer)
- Bullet-list **DB Schema** (per-module table details, NOT table format)
- Bullet-list **Tech Stack** (locked stack: Next.js + FastAPI + SQLite/Drizzle + Better Auth + M3 + Tailwind)
- Prose **User Flow** (one flow per role, ~4 flows total)
- **Feature Specifications section is MANDATORY** — for EACH feature in Requirements, write:
  ```
  ## Feature: [Name]
  [one-line description]
  ## Specification
  ### Goal
  ### Definition of Done
  - [ ] AC1
  - [ ] AC2
  ## Sub-feature: [Sub-name]
  ### Goal
  ### Definition of Done
  - [ ] AC1
  - [ ] AC2
  ```
  See `references/feature-spec-style-guide.md` for the Console Catalog style. User has explicitly rejected PRDs without this section.

### 2. Publish PRD to Notion
- Parent page ID: `3938f6b0a7a580dfa587f838c3f2416` (PRD parent)
- Create ONE child page titled **"Hospital Management System — Phase 1 PRD"**
- Body: full PRD markdown converted to Notion blocks
- Save page URL → `/tmp/hospital-pm/notion-page.json`

### 3. Create GitHub repo
```bash
gh repo create arkinara/hospital-management-system --public --source=. --description="Hospital Management System — modular web app for small clinic to multi-department enterprise hospital"
```
- Capture URL + PVT metadata → `/tmp/hospital-pm/repo.json`

### 4. Create GitHub Project (4 lanes — Todo / In Progress / In QA / Done)
```bash
gh project create --owner arkinara --title "Hospital Management Board"
```
- Capture project number + PVT ID
- Ensure 4-lane Status field exists (Todo, In Progress, In QA, Done). If the default project has only 3 lanes, ADD "In QA" using the working GraphQL pattern from `references/github-projects-graphql-api.md` (use `updateProjectV2Field` with the FULL options list, every existing option preserving its id).
- Save → `/tmp/hospital-pm/project.json`

### 5. Split into BE domains
Group BE tickets by domain — each domain owns its tables + API:
- `BE-auth` (Better Auth, RBAC matrix, login/logout/me, role assignment)
- `BE-patient` (patient CRUD, dedup detection, search)
- `BE-appointment` (booking, doctor daily schedule, conflict detection)
- `BE-medical-records` (visit notes, prescriptions, attachments, history view)
- `BE-billing` (invoices, insurance claim, payment status)
- `BE-admin` (user management, department management, role assignment, widget config global lock)
- `BE-widget-config` (user dashboard widget layout persistence)

### 6. Author ticket bodies → `/tmp/hospital-pm/tickets.json`
**Ticket types** (label-prefix encodes type):
- **FE** (label `FE`): UI components, screens, navigation, forms, role-based default dashboards, widget grid DnD UI. Mock data only at this stage.
- **BE** (label `BE`, by domain above): API endpoints, DB migrations per domain, auth flow, business logic.
- **FE Wiring** (label `FE Wiring`): wire completed FE pages to real BE APIs. Per-page wiring — one ticket = one page integrated.

**FE tickets (proposed split for Phase 1):**
1. App shell (sidebar nav, role-based menu, theme)
2. Auth pages (sign-in / sign-up / forgot password)
3. Patient registration form (receptionist view) + patient search
4. Patient list + patient detail (history view across departments)
5. Appointment booking form + doctor daily calendar view
7. Medical record entry (visit note, prescription) + patient timeline
8. Billing invoice list + invoice detail + payment recording
9. Admin user management (CRUD, role assignment, department assignment)
10. Admin department management (CRUD departments)
11. Admin widget library settings (global enable/disable + lock)
12. Modular widget dashboard (DnD, role-based defaults, per-user persistence)
13. Receptionist dashboard (today's appointments, registration queue)
14. Doctor dashboard (today's schedule, pending records, vitals queue)
15. Nurse dashboard (assigned patients, vitals entry, care plan)
16. Receptionist appointment booking UI polish
17. Patient timeline cross-department (specialized history view)
18. Reports module skeleton (admin reports placeholder, real reports = Phase 2)

**BE tickets (one per domain, with sub-features):**
- #19 BE-auth: Better Auth setup, login/logout/me endpoints, RBAC matrix table seeded, role assignment API, session refresh
- #20 BE-patient: patient CRUD, dedup detection (national_id + name+DOB fuzzy match), patient search API
- #21 BE-appointment: appointment CRUD, doctor daily schedule endpoint, conflict detection (same doctor double-booking), availability rules
- #22 BE-medical-records: visit notes CRUD, prescription CRUD, attachments upload, patient history endpoint (cross-department aggregate)
- #23 BE-billing: invoice CRUD, line items, insurance claim stub, payment status workflow
- #24 BE-admin: user CRUD, department CRUD, role assignment endpoint, department-staff mapping
- #25 BE-widget-config: per-user widget layout persistence (ordered list of widget IDs), global lock enforcement from admin

**FE Wiring tickets (after FE + corresponding BE pass):**
- #26 FE Wiring: Auth pages → BE-auth (sign-in/sign-up/me/refresh)
- #27 FE Wiring: Patient registration + search → BE-patient
- #28 FE Wiring: Patient list + detail → BE-patient
- #29 FE Wiring: Appointment booking + doctor schedule → BE-appointment
- #30 FE Wiring: Medical record entry + patient timeline → BE-medical-records
- #31 FE Wiring: Billing invoice list + detail + payment → BE-billing
- #32 FE Wiring: Admin user mgmt → BE-admin
- #33 FE Wiring: Admin department mgmt → BE-admin
- #34 FE Wiring: Admin widget library → BE-widget-config
- #35 FE Wiring: Modular widget dashboard → BE-widget-config

**Total: 35 tickets.** For each ticket write:
```json
{
  "number": 1,
  "title": "...",
  "type": "FE | BE | FE Wiring",
  "domain": "<be-domain> for BE | null",
  "labels": ["FE"] or ["BE", "BE-<domain>"],
  "body_markdown": "## Description\n...\n## Positive Acceptance Criteria\n- [ ] ...\n- [ ] ...\n## Negative Acceptance Criteria\n- [ ] ...\n- [ ] ..."
}
```

**Ticket body MUST mirror sub-feature structure** for the major features. Each ticket MUST include `## Sub-feature:` sections that match the parent PRD feature spec — NOT a flat AC list. See `references/feature-spec-style-guide.md`.

### 7. Mechanical verification gate (BEFORE step 8)
Run the Python verifier from `references/pm-ticket-traceability-verifier.md` against `/tmp/hospital-pm/tickets.json`. PASS required before creating GitHub issues. If FAIL, fix and re-verify (do NOT proceed).

### 8. Create GitHub issues + link to project
Use `scripts/pm-github-pipeline.py` (or equivalent gh + GraphQL calls) to:
- `gh issue create` for each ticket body (with correct labels)
- `addProjectV2ItemById` to link each issue to the project
- Write sidecar `/tmp/hospital-pm/created-issues.json` so reruns skip

**CRITICAL**: Before invoking the pipeline, clean any stale `/tmp/pm-created-issues.json` from prior projects (per pitfall #45).

### 9. Final report
Print summary:
- PRD path
- Notion page URL
- Repo URL
- Project PVT ID + URL
- Ticket count (FE / BE / FE Wiring)
- Linked count (verify all tickets are on the board)
- Verifier verdict (PASS/FAIL)

---

# OUTPUT FILES (must all exist when done)
- `/tmp/hospital-pm/prd-final.md`
- `/tmp/hospital-pm/notion-page.json`
- `/tmp/hospital-pm/repo.json`
- `/tmp/hospital-pm/project.json`
- `/tmp/hospital-pm/tickets.json`
- `/tmp/hospital-pm/created-issues.json`
- Final stdout summary

---

# RULES (locked)
- **Tech stack is locked.** Do NOT re-ask. Next.js + FastAPI + SQLite/Drizzle + Better Auth + M3 + Tailwind.
- **Feature Specifications section is mandatory.** PRDs without it have been explicitly rejected.
- **Tickets MUST include sub-feature sections** mirroring the PRD — flat DoD rejected.
- **Notion = PRD storage only.** Do NOT mirror tickets to Notion.
- **GitHub Project = single source of truth** for tickets.
- **4-lane board mandatory:** Todo / In Progress / In QA / Done.
- **Step 3A traceability gate BEFORE Step 3B.** Do NOT skip the verifier.
- **Clean stale sidecars before Step 3B.**

Work step by step. Print each artifact path as you finish it. Final report at the end.