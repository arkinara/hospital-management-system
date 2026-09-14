# Manual verification guide

Everything below was run against `main` at `b84cefc` and reports what it actually
produced. Commands assume you start from the repository root.

---

## 1. One-time setup

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows (Git Bash / PowerShell: .venv\Scripts\activate)
# source .venv/bin/activate       # macOS / Linux
pip install -r requirements.txt
python -m db.migrate              # 5 migrations -> backend/db/hospital.db
python -m db.seed                 # ~3,474 rows
```

`db.seed` is idempotent — re-running it never duplicates rows. To start from
scratch, delete `backend/db/hospital.db` and run both commands again.

A `JWT_SECRET is not set` warning on startup is expected in development; the app
generates a random secret per boot, so sessions do not survive a restart. Set
`JWT_SECRET` in `backend/.env` (copy from `backend/.env.example`) if that bothers
you. In `ENVIRONMENT=production` the app refuses to boot without it.

### Frontend

```bash
cd frontend
npm ci
```

**On Windows use `npm ci --ignore-scripts`.** `better-sqlite3` needs MSVC build
tools and its `node-gyp` step fails otherwise. Only the Drizzle `db:*` scripts
use it, so the dev server, the test suite and `npm run build` all work without
it.

---

## 2. Run the app

Two terminals:

```bash
# terminal 1
cd backend && uvicorn app.main:app --reload --port 8000

# terminal 2
cd frontend && npm run dev
```

Or both at once, from bash: `scripts/dev.sh` (logs land in `.dev-logs/`).

| Service  | URL                              |
|----------|----------------------------------|
| Frontend | http://localhost:3000            |
| Backend  | http://localhost:8000            |
| API docs | http://localhost:8000/docs       |
| Health   | http://localhost:8000/health     |

### Mock vs. real backend

**The frontend runs against MSW mocks by default** — it will look like it works
even with no backend running. To exercise the real API, create
`frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_MOCK=off
```

Restart `npm run dev` after changing it.

---

## 3. Test credentials

Password for **every** seeded account: `Hospital2025!`

### Clean role accounts — use these for role-by-role testing

| Email                        | Role         | Name               |
|------------------------------|--------------|--------------------|
| `admin@hospital.test`        | admin        | System Admin       |
| `doctor@hospital.test`       | doctor       | Dr. Alice Chen     |
| `nurse@hospital.test`        | nurse        | Nurse Bob Tan      |
| `receptionist@hospital.test` | receptionist | Receptionist Carol |

### Fixture staff — the names that appear in seeded data

| Email                      | Role         | Name              |
|----------------------------|--------------|-------------------|
| `rahmat.h@sirkaya.health`  | admin        | Rahmat Hidayat    |
| `sari.w@sirkaya.health`    | doctor       | Dr. Sari Wibowo   |
| `adi.n@sirkaya.health`     | doctor       | Dr. Adi Nugroho   |
| `wati.l@sirkaya.health`    | nurse        | Wati Lestari      |
| `ika.p@sirkaya.health`     | receptionist | Ika Permata       |

Ten more doctors/nurses/receptionists exist on `@sirkaya.health`; the full list
is `frontend/src/lib/fixtures/data.json` → `users`.

### Login lockout — read this before you think the password is wrong

5 failed attempts on one email (or 20 from one IP) inside a 15-minute window
trigger a 15-minute lockout. A locked-out login returns the **same** 401 as a
wrong password — deliberately, so an attacker cannot probe it. If a correct
password suddenly stops working, this is why.

Clear it by waiting out the cooldown, or:

```bash
cd backend && python -c "import sqlite3; c=sqlite3.connect('db/hospital.db'); \
c.execute(\"DELETE FROM audit_log WHERE action='login.failed'\"); c.commit()"
```

(There is no `sqlite3` CLI on this machine; the one-liner above needs nothing
beyond the stdlib.)

Thresholds are tunable via `AUTH_*` in `backend/.env` (see `.env.example`).

---

## 4. Checks you can run

### Backend — from `backend/`, venv active

| What        | Command                                  | Expected                |
|-------------|------------------------------------------|-------------------------|
| Tests       | `pytest -q`                              | 293 passed              |
| Lint        | `ruff check .`                           | `All checks passed!`    |
| Format      | `ruff format --check .`                  | `53 files already formatted` |
| Imports     | `python -c "from app.main import app"`   | no output               |

### Frontend — from `frontend/`

| What        | Command                     | Expected                          |
|-------------|-----------------------------|-----------------------------------|
| Tests       | `npm run test:run`          | 306 passed in 59 files (~1 min)   |
| Typecheck   | `npx tsc --noEmit`          | no output                         |
| Lint        | `npm run lint`              | exit 0; 11 `react-hooks/exhaustive-deps` warnings are pre-existing |
| Build       | `npm run build`             | build succeeds                    |
| State coverage | `npx vitest --run __tests__/state-coverage.test.tsx` | 1 file passed |

### End-to-end against a live backend

```bash
bash frontend/scripts/run-e2e-live.sh
```

Seeds a throwaway SQLite database, boots FastAPI on :8000, waits for `/health`,
then runs 4 role journeys (receptionist, doctor, nurse, admin) with MSW off and
real `fetch`. Fails — never skips — if the backend does not come up. Stops the
server on exit.

Needs bash, `curl`, and **`python3` on PATH**. On Windows `python3` often is not
available even when `python` is; if so, run the same steps by hand:

```bash
cd backend && python -m db.migrate && python -m db.seed && uvicorn app.main:app --port 8000
# then, in another terminal:
cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8000 NEXT_PUBLIC_API_MOCK=off E2E_LIVE=1 npx vitest --run --project=e2e-live
```

CI runs the equivalent as the `E2E (journeys against live backend)` job.

---

## 5. 60-second smoke test

With the backend running:

```bash
curl -s http://localhost:8000/health
# {"status":"ok","version":"dev","domains":["auth","patient","appointment",
#  "medical-records","billing","admin","widget-config","audit"]}

curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hospital.test","password":"Hospital2025!"}'
# {"access_token":"eyJ...","refresh_token":"...","user":{"id":16,"full_name":"System Admin",...}}
```

Then use the token:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hospital.test","password":"Hospital2025!"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/patients?limit=3"
```

In the browser: http://localhost:3000/sign-in, sign in as any account above, and
switch roles by signing in as a different one.

---

## 6. Known Windows-only noise

These are environment artifacts, not product defects. All three suites are green
on Linux CI.

- `pytest -q` reports ~13 failures/errors on Windows:
  `PermissionError: [WinError 32] ... hospital-test-shared.db` (the SQLite handle
  is not closed before the temp file is unlinked) and a `UnicodeDecodeError` in
  `tests/test_frontend_contract.py` (`path.read_text()` with no `encoding=`, so
  it uses cp1252). Re-running any of those tests on its own passes.
- `npm ci` fails on `better-sqlite3`; use `npm ci --ignore-scripts` (§1).
- `scripts/dev.sh` and `run-e2e-live.sh` need Git Bash, not PowerShell.
- **`GET /patients` returns 500 on Windows.** `datetime.fromtimestamp()` raises
  `OSError: [Errno 22] Invalid argument` for negative epochs on Windows, and any
  patient born before 1970 has one. It surfaces at
  `app/routers/patient.py:143` (`_ts_to_date`, the `dob` field) and takes the
  whole patient list and detail views with it. Linux and CI are unaffected. Fix
  is to compute from the epoch instead:
  `datetime(1970, 1, 1, tzinfo=UTC) + timedelta(seconds=int(value))`.

---

## 7. Ground truth for "is `main` healthy?"

```bash
gh run list --limit 1
gh run view <id> --json conclusion,jobs
```

Four jobs must all be `success`: `Backend`, `Frontend`, `State coverage`,
`E2E (journeys against live backend)`. Note that the e2e job has
`needs: [backend, frontend]` — if either fails, e2e reports **skipped**, not
failed, which is easy to misread as passing.
