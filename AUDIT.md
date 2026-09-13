# Delivery audit — project board #16 vs. the code

Date: 2026-09-13
Scope: all 55 tickets on `arkinara/projects/16`, every one marked **Done**, checked against `main` at `88edbd2`.

Verdict: the features are broadly built, but "Done" was never backed by a passing pipeline. `main` could not install, could not import, and failed lint; the test suites existed but nothing ran them. Separately, the M3 "FE Wiring" tickets wired the frontend to the **mock** contract, not to the FastAPI backend.

Everything in *Fixed* below is committed and verified. Everything in *Outstanding* is untouched and still real work.

---

## 1. `main` was red before any feature question

| # | Problem | Evidence | Status |
|---|---------|----------|--------|
| 1 | Backend could not import at all | `ModuleNotFoundError: No module named 'jwt'` — `app/dependencies.py:16` and `app/security.py:18` import `jwt`, but `PyJWT` was absent from `requirements.txt` | Fixed |
| 2 | Backend could not import, second cause | `ImportError: email-validator is not installed` — `admin.py` uses pydantic `EmailStr` | Fixed |
| 3 | Backend lint red | `ruff check` reported 100 errors across 25 files (E702 semicolons, E501, F401, W292, B904); `ruff format --check` wanted 25 files reformatted. CI runs both, so the backend job failed on every push | Fixed |
| 4 | CI never ran the test suites | `ci.yml` ran lint, `tsc`, `build`, an import probe and a `/health` curl. No `pytest`, and only the single `state-coverage.test.tsx` file of the frontend suite. Ticket #55 shipped a harness nothing executed | Fixed |
| 5 | 23 frontend tests failed | Node ≥24 exposes a global `localStorage` that reads as `undefined` unless `--localstorage-file` is passed, and it shadows the one jsdom installs. `beforeEach` threw, so RTL `cleanup()` never ran, and every later test saw a duplicated DOM ("Found multiple elements…"). One root cause, 23 symptoms | Fixed |

After the fixes: **backend 278 passed, ruff clean; frontend 306 passed, `tsc` clean, build clean.**

CI now runs `pytest -q` and `npm run test:run`, so this class of drift fails the pipeline instead of hiding in it.

---

## 2. The real misalignment: FE was wired to the mocks, not the backend

The M3 tickets (#25–#35, #50–#53) are titled "FE Wiring: X → BE-Y" and all read Done. In fact the frontend called paths that only ever existed in `src/lib/api/handlers.ts` (MSW). The mock answered, the tests passed, and the FastAPI app would have returned 404 for all of them.

14 call paths had no backend route:

| Frontend called | Backend actually serves |
|---|---|
| `GET/POST /invoices`, `GET /invoices/{id}`, `POST /invoices/{id}/payments` | `/billing/invoices…` |
| `GET /claims` | `/billing/claims` |
| `GET /permissions`, `PUT /permissions/{role}/{module}` | `/auth/permissions…` |
| `GET/PUT /widgets/me` | `/widget-config/me` |
| `GET /widgets/admin/library` | `/widget-config/widgets/admin/library` |
| `POST /admin/widgets`, `PATCH /admin/widgets/{id}` | *nothing — endpoints did not exist* |
| `GET /medical-records/{mrn}/visits` | `/medical-records/patients/{id}/visits` |
| `GET /medical-records/visits` | *nothing — endpoint did not exist* |
| `GET /patients/{mrn}/prescriptions` | *nothing — endpoint did not exist* |
| `GET /audit-log` | `/audit/log` |

**Fixed.** Backend is canonical, so the frontend moved to it. Four missing endpoints were added over the existing schema (no migration needed):

- `POST /widget-config/widgets` — create a widget definition (409 on duplicate key)
- `PATCH /widget-config/widgets/{id}` — `globally_enabled` / `default_role` / `name` (the table already had these columns; only the lock flag had been exposed)
- `GET /medical-records/visits` — cross-patient visit worklist, filterable by `doctor_id`, `patient_id`, `signed`
- `GET /medical-records/patients/{id}/prescriptions` — all prescriptions across a patient's visits

All 53 frontend call paths now resolve to a real route, and `backend/tests/test_frontend_contract.py` asserts it by reading the frontend sources — a renamed route now fails a test instead of production. New endpoints are covered by RBAC-matrix entries and behaviour tests.

---

## 3. Tickets marked Done with the deliverable missing

| Ticket | Claim | Reality | Status |
|---|---|---|---|
| #53 | "Admin audit log viewer + wiring → BE-audit" | No `/admin/audit` page existed. The command palette linked to it, so the link 404'd. Only a mock handler shipped | Fixed — page built on `GET /audit/log` with action/entity filters, all four data states, a11y test |
| #1 / #6 | Sidebar lists Records as a top-level module | The Records nav item pointed at `/records`, which is not a route. Only `/medical-records/new` existed | Fixed — Records worklist page added at `/medical-records` (defaults to unsigned notes), nav repointed |
| #10 | Admin widget library reachable from nav | Nav pointed at `/admin/widgets`; the page lives at `/admin/widget-library`. Dead link | Fixed — nav repointed |

Spot-checks that **passed**: #1 skip link and the five-item mobile bottom bar with overflow (`AppShell.tsx`), #2 no self-service sign-up route, #11 drag-and-drop widget grid, #17 reports placeholder, #47 permission matrix, #48 doctor availability, #49 command palette, #54 a11y suite (18 page scans, now 20), #55 four e2e journeys.

---

## 4. Outstanding — tracked as #57, #58, #59, #60

Paths now line up. **Payload shapes and identifiers do not.** The frontend types are the prototype fixture shapes; the backend returns database rows. This was the part of "wiring" the M3 tickets never did, and it is a real piece of work, not a rename:

- **Shape drift.** `Patient` in the frontend is `{mrn, name, nid, dept, doctor, balance, insurer}`; the backend serialises `{id, mrn, full_name, national_id, primary_department_id, …}`. Overlap is nearly nil. `Invoice`, `VisitNote` and the widget types differ the same way (camelCase fixture shapes vs. snake_case rows, nested vs. flat).
- **Identifier drift.** Six patient calls pass an MRN string where the backend expects an integer `patient_id` (422 against the real API). Resolution exists — `GET /patients?query=<mrn>` matches MRN and returns the row including `id` — but nothing calls it. Widgets have the same split: the frontend keys by `key`, the backend by integer `id`.
- **Body-field drift.** The lock toggle sends `{locked: true}`; the backend expects `{globally_locked: true}`.
- **Consequence.** With `NEXT_PUBLIC_API_URL` pointed at FastAPI and MSW off, screens still break — now on deserialisation rather than 404s.

Tracked as **#57**. Closing it means an adapter layer per domain (or re-typing the frontend to the backend's shapes) plus rewriting the MSW handlers to emit backend-shaped payloads so the tests keep testing something true. Recommended order: patients → billing → records → widgets, one domain per PR, extending `test_frontend_contract.py` to compare response shapes as each lands.

Also open:

- **#58** — `POST /auth/login` has no rate limit or lockout. Failed attempts are already audited; nothing reads them. These accounts reach patient records.
- **#60** — `environmentMatchGlobs` in `vitest.config.ts` is deprecated in Vitest 3 and removed in 4. The upgrade fails silently: every `.tsx` test drops to the `node` environment.
- CI ran on Node 20, where jsdom 30 cannot load at all (`TypeError: webidl.util.markAsUncloneable is not a function` out of undici). That is why the pre-existing state-coverage job had never passed. CI now pins Node 22; the `localStorage` shim in `vitest.setup.ts` is what lets the same suite run on Node ≥24 locally.
- **#59** — no CI job runs the e2e journeys against a live backend. They run entirely against MSW, which is how the drift in this section survived a green suite through all of M3.

## 5. Fixed after the first pass

- CI ran the frontend on Node 20, where jsdom 30 cannot load at all. Pinned to Node 22 in caec18b; all three jobs then passed for the first time.
- A password reset left every existing refresh token valid for its remaining 7 days, so a reset could not lock an attacker out. Reset and change-password now revoke live sessions, matching role change and deactivation (949097a).
- With `ENVIRONMENT=production` and no `JWT_SECRET`, the app booted on a random per-startup secret behind a warning — sessions die on every restart and two workers reject each other's tokens. It now refuses to boot (949097a).
