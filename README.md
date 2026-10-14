# QuickLink

QuickLink is a production-oriented school data collection, monitoring and reporting
platform. It lets a team capture school records (with per-trade student counts),
monitor live statistics, manage accounts, and export professional PDF / CSV reports.
It works as an installable PWA and can capture records offline, syncing them to the
server when connectivity returns.

- **Frontend:** React 18, Vite, JavaScript, Tailwind CSS, Axios, Lucide React, Framer Motion
- **Backend:** Express.js, MongoDB / Mongoose, JWT auth, bcrypt, Zod validation, PDFKit
- **Data:** every school is an independent MongoDB record; records are never stored only in the browser

---

## Contents

- [Architecture](#architecture)
- [Features](#features)
- [Project structure](#project-structure)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Seed data](#seed-data)
- [Testing](#testing)
- [API reference](#api-reference)
- [Reports](#reports)
- [Offline & PWA](#offline--pwa)
- [Deployment](#deployment)
- [Security notes](#security-notes)

---

## Architecture

```
Browser (React PWA)  ──HTTP/JSON──▶  Express API  ──Mongoose──▶  MongoDB
        │                                  ▲
        │  IndexedDB (drafts + sync queue) │
        └────────── offline capture ───────┘  (syncs when back online)
```

- The frontend never keeps school records as its only copy. Offline records are
  staged in IndexedDB and pushed to the API; they are only marked **Synced** after
  the server confirms the write to MongoDB.
- Authentication uses a signed JWT. Passwords are hashed with bcrypt (12 rounds)
  and are never returned by the API.

## Features

- **School records** — create, view, edit, search, filter, archive and restore.
  Each record is a permanent MongoDB document linked to a holding/project and district.
  Multiple schools can live under one holding; adding a school never overwrites another.
- **Trade counts** — SOD, NIT, CSA, ACC and Other. All counts are non-negative
  integers; the **total** is computed automatically as `SOD + NIT + CSA + ACC + Other`.
  Unknown values are stored as `null`, flagged as **incomplete**, and are *not*
  counted as zero.
- **Duplicate detection** — the API flags a same-name school under the same holding
  and the user explicitly confirms before saving.
- **History** — create / update / archive / restore events are written to an audit log.
- **Accounts (multi-user)** — public registration with **owner approval**. New sign-ups
  start as *pending* and cannot sign in until an owner approves them. The first account
  (the bootstrap owner) can create accounts directly and approve/reject registrations.
  Each account's school data is fully isolated — accounts never see each other's records.
  Includes secure login, password change and logout.
- **Notifications** — owners get an in-app notification (bell with an unread badge)
  whenever a new account registers and awaits approval.
- **Student management** — enrol learners under a school with an auto-allocated
  candidate **index number** (NESA / RTB style), trade, TVET level, sponsorship,
  guardian contact and a status lifecycle (enrolled / graduated / transferred /
  dropped). Includes learner insights (by trade, level, status and gender), a
  **certification-readiness** indicator (eligible for national / TVET exams) and a
  one-click CSV **student register** export.
- **Dashboard** — live MongoDB aggregations: holdings, schools, students (by trade),
  laptops, teachers, recent records, incomplete records, and groupings by holding and district.
- **Reports** — individual, holding, district, complete and date-range reports with an
  in-app preview and downloadable PDF (PDFKit) plus CSV export.
- **PWA / mobile** — installable, responsive, mobile bottom navigation, offline capture,
  IndexedDB drafts, and clear Pending Sync / Synced / Sync Failed states.
- **Customisable sidebar** — the desktop sidebar can be hidden/shown; the choice is remembered.

## Project structure

```
quicklink/
├─ server/                  Express API
│  ├─ src/
│  │  ├─ config/            env + db connection
│  │  ├─ controllers/       auth, users, schools, students, notifications, dashboard, reports
│  │  ├─ middleware/        auth, validation, error handling
│  │  ├─ models/            User, Holding, School, Student, Notification, AuditLog
│  │  ├─ routes/            API route definitions
│  │  ├─ services/          PDF builder, owner bootstrap
│  │  ├─ scripts/seed.js    seed data
│  │  ├─ utils/             ApiError, asyncHandler, token, validators
│  │  ├─ app.js             express app
│  │  └─ index.js           server entrypoint
│  └─ tests/                node:test + supertest integration tests
├─ client/                  React PWA
│  ├─ public/               manifest, service worker, icons
│  └─ src/
│     ├─ api/               axios client
│     ├─ components/        layout + UI components
│     ├─ context/           auth, sync, toast providers
│     ├─ lib/               indexeddb, sync engine, reports, formatting
│     └─ pages/             dashboard, schools, students, reports, users, sync, settings
├─ docker-compose.yml
└─ .env.example
```

## Local development

### Prerequisites

- Node.js 20+
- A running MongoDB (local service or MongoDB Atlas connection string)

### 1. Backend

```bash
cd server
cp .env.example .env        # then edit values
npm install
npm run seed                # optional: load demo holdings + schools
npm run dev                 # starts the API locally (deployed: https://quicklink-3eng.onrender.com)
```

On first boot the server creates the initial owner account from `OWNER_*` in `.env`.
New users can self-register via the app; an owner approves them before first sign-in.

### 2. Frontend

```bash
cd client
cp .env.example .env
npm install
npm run dev                 # starts the Vite dev server (deployed: https://quicklink-zeta.vercel.app)
```

The Vite dev server proxies `/api` to the API (defaults to the deployed
`https://quicklink-3eng.onrender.com`, see `vite.config.js`),
so `VITE_API_URL` can stay empty during development.

### 3. Sign in

Use the `OWNER_EMAIL` / `OWNER_PASSWORD` from `server/.env`
(defaults: `owner@quicklink.local` / `ChangeMe123!` — change these).

## Environment variables

Backend (`server/.env`):

| Variable | Description | Default |
| --- | --- | --- |
| `NODE_ENV` | `development` / `production` / `test` | `development` |
| `PORT` | API port | `4000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/quicklink` |
| `JWT_SECRET` | Token signing secret (required in production) | dev fallback |
| `JWT_EXPIRES_IN` | Token lifetime | `12h` |
| `CORS_ORIGIN` | Comma-separated allowed origins | `https://quicklink-zeta.vercel.app` |
| `OWNER_NAME` / `OWNER_EMAIL` / `OWNER_PASSWORD` | Initial owner account | see example |
| `ORG_NAME` / `ORG_SUBTITLE` | Report header text | QuickLink defaults |
| `TRUST_PROXY` | Set `true` behind a reverse proxy | `false` |

Frontend (`client/.env`):

| Variable | Description |
| --- | --- |
| `VITE_API_URL` | Public API base URL. Empty = same origin / dev proxy |

## Seed data

`npm run seed` (in `server/`) clears schools and holdings, then creates three holdings,
five districts and 36 school records (including intentionally incomplete ones) so the
dashboard and reports have realistic data. It does not delete user accounts.

## Testing

Integration tests use `node:test`, `supertest` and (by default) an in-memory MongoDB
that is downloaded on first run. If the in-memory server is unavailable, set
`TEST_USE_MEMORY=false` to run against a local test database instead.

```bash
cd server
npm test                     # in-memory MongoDB
TEST_USE_MEMORY=false npm test   # use ${MONGODB_URI} test database
```

The suite covers: authentication, protected routes, school creation, automatic trade
totals, negative/unknown value handling, independent record persistence, duplicate
detection and confirmation, edit, archive/restore, history, search/filter, idempotent
offline sync (`clientId`), dashboard aggregation, account creation, password change,
owner notifications, student enrolment/update/removal, candidate index-number
uniqueness, per-account student isolation, student register CSV export, multi-page PDF
generation and CSV export.

## API reference

All routes are under `/api`. `GET /health` (liveness) and `GET /health/ready`
(database readiness) live at the root. Except `/api/health`, `/api/auth/login` and
`/api/auth/register`, every route requires `Authorization: Bearer <token>`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` · `/health/ready` | Liveness / readiness probes |
| `GET` | `/api/health` | API health check |
| `POST` | `/auth/register` | Self-register (creates a *pending* account) |
| `POST` | `/auth/login` | Sign in, returns JWT |
| `GET` | `/auth/me` | Current user |
| `POST` | `/auth/change-password` | Change own password |
| `GET` | `/users` | List accounts (owner only) |
| `GET` | `/users/pending` | List pending registrations (owner only) |
| `POST` | `/users` | Create account (owner only) |
| `POST` | `/users/:id/approve` · `/users/:id/reject` | Approve/reject a registration (owner only) |
| `PATCH` | `/users/:id` | Update account (name, active, password) (owner only) |
| `GET` | `/schools` | List/search/filter (`search, holding, district, status, incomplete, from, to, page, limit, sort`) |
| `POST` | `/schools` | Create school (idempotent via `clientId`) |
| `GET` | `/schools/check-duplicate` | Duplicate check (`schoolName`, `holding`) |
| `GET` | `/schools/:id` | Get one school |
| `PATCH` | `/schools/:id` | Update school |
| `POST` | `/schools/:id/archive` | Archive |
| `POST` | `/schools/:id/restore` | Restore |
| `GET` | `/schools/:id/history` | Audit history |
| `GET` | `/students` | List/search/filter (`search, school, trade, status, level, district, page, limit`) |
| `POST` | `/students` | Enrol a student (auto index number if omitted) |
| `GET` | `/students/stats` | Learner insights + certification readiness |
| `GET` | `/students/export` | CSV student/candidate register |
| `GET` | `/students/:id` | Get one student |
| `PATCH` | `/students/:id` | Update student |
| `DELETE` | `/students/:id` | Remove student |
| `GET` | `/notifications` | List notifications + unread count |
| `POST` | `/notifications/:id/read` | Mark one notification read |
| `POST` | `/notifications/read-all` | Mark all notifications read |
| `GET` | `/dashboard` | Aggregated statistics |
| `GET` | `/reports/meta` | Report types + trade labels |
| `GET` | `/reports/preview/:type` | JSON preview data |
| `GET` | `/reports/pdf/:type` | Download PDF |
| `GET` | `/reports/csv/:type` | Download CSV |
| `GET` | `/reports/{pdf,csv,preview}/school/:id` | Individual school report |

`:type` is one of `all`, `holding`, `district`, `range`.

## Reports

Reports are rendered server-side with **PDFKit** for reliable pagination. Each report
includes the organization heading/logo, title, holding, district, reporting period, a
school-by-school table with per-trade counts and totals, combined totals and trade
breakdown, per-school feedback, missing-data notes, and a footer with generation date
and page numbers. Table headers repeat across pages and long feedback wraps safely.
The app also offers an HTML preview before export, plus CSV export for analysis.

## Offline & PWA

- `client/public/manifest.webmanifest` + `sw.js` make the app installable. The service
  worker caches the app shell but **never caches `/api`** traffic.
- New school records captured offline are stored in IndexedDB and shown on the **Sync**
  page as **Pending Sync**. They are pushed to the server on reconnect or on demand.
- Records only show **Synced** after MongoDB confirms the write. Failed syncs show
  **Sync Failed** with the error and can be retried.
- Each offline record carries a `clientId`; the API is idempotent on that id, so retries
  and duplicate submissions are safe.

## Deployment

### Option A — Docker Compose (everything)

```bash
# from the project root
export JWT_SECRET="a-long-random-secret"
export OWNER_EMAIL="you@example.com"
export OWNER_PASSWORD="a-strong-password"
docker compose up --build
# client: https://quicklink-zeta.vercel.app   api: https://quicklink-3eng.onrender.com
```

The client's nginx proxies `/api` to the `server` service and MongoDB data is persisted
in the `mongo-data` volume.

### Option B — Managed services

**MongoDB** — create a free cluster on MongoDB Atlas, create a database user, allow your
host IPs, and copy the connection string into `MONGODB_URI`.

**Backend (Render)** — the live service is `quicklink-rwanda-school`
(`https://quicklink-3eng.onrender.com`). Configure it as:

| Setting | Value |
| --- | --- |
| Root Directory | `server` |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

Environment variables: `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`,
`JWT_EXPIRES_IN=12h`, `CORS_ORIGIN=https://quicklink-zeta.vercel.app`,
`OWNER_EMAIL`, `OWNER_PASSWORD`, `TRUST_PROXY=true`. (`PORT` is set by Render.)
A matching `render.yaml` blueprint is included. **Note:** the build command must be
`npm ci` (or `npm install`) — using `npm run dev` as the build command skips dependency
installation and crashes with `Cannot find package 'express'`.

**Frontend (Vercel)** — the live site is `https://quicklink-zeta.vercel.app`, project
root `client`, framework **Vite**, output `dist`. Set `VITE_API_URL` to the backend URL
(`https://quicklink-3eng.onrender.com`) in Vercel → Settings → Environment Variables for
the Production environment (a built-in fallback exists in `src/api/client.js`). SPA
routing is configured by `client/vercel.json`, which rewrites unknown paths to
`index.html` so deep links like `/schools` load instead of returning 404.

**Important:** serve over HTTPS so the service worker and install prompt work.

## Security notes

- Passwords are bcrypt-hashed and never serialized to clients.
- Login is rate-limited; failures return a generic message that does not reveal whether
  an email exists.
- JWT tokens are invalidated when the password changes.
- All school and user routes require authentication. There is no public registration.
- Set a strong, unique `JWT_SECRET` and change the default owner password before
  exposing the API publicly.
