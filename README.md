# Hospital Management System

Phase 1 foundation for a hospital management system: a Next.js (App Router)
frontend and a FastAPI backend over a shared SQLite database managed by
Drizzle migrations. The UI compiles the same design tokens as the
`promax-prototype/` reference, so the prototype and the app agree on color,
spacing and component contracts.

## Stack

| Layer      | Choice                                             |
| ---------- | -------------------------------------------------- |
| Frontend   | Next.js 14 (App Router), React 18, TypeScript strict |
| Styling    | Tailwind CSS 3, Material 3 tokens via promax       |
| Backend    | FastAPI, Pydantic v2 / pydantic-settings           |
| Database   | SQLite via Drizzle ORM + better-sqlite3            |
| Tooling    | ESLint, ruff, pytest, GitHub Actions               |

## Project Structure

```
hospital-ms/
├── .github/workflows/ci.yml   # lint, type-check, build, health probe
├── scripts/dev.sh             # one command to run both services
├── frontend/                  # Next.js app + Drizzle workspace
│   ├── src/app/               # App Router: (auth) + (app) route groups
│   ├── db/                    # Drizzle schema, migrations, migrate/seed
│   └── tailwind.config.ts     # promax token names
├── backend/                   # FastAPI app
│   ├── app/routers/           # one router package per domain
│   ├── app/config.py          # env-driven settings with defaults
│   └── db/                    # migrate + seed against shared SQLite
├── promax-prototype/          # design-system reference + components
└── prd-final.md               # Phase 1 PRD
```

## Local Development

One command starts both services and tails their logs:

```bash
./scripts/dev.sh
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000 (interactive docs at `/docs`)
- Health: http://localhost:8000/health

Press Ctrl-C to stop both. Logs are written to `.dev-logs/`.

To run a stack on its own:

```bash
# Frontend
cd frontend && npm install && npm run dev

# Backend
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload

# Database (from frontend/)
npm run db:migrate && npm run db:seed
```

## Design Reference

- `promax-prototype/DESIGN_SYSTEM.md` — token and component contract
- `promax-prototype/components/` — reference component implementations

## Tickets

Work is tracked on GitHub:
https://github.com/arkinara/hospital-management-system/issues
