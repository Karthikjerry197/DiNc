# Deployment Guide

DiNC deploys as three units: a PostgreSQL database, the NestJS API, and the
Next.js frontend. Both apps are plain Node.js processes — no Docker files or
platform-specific tooling are assumed.

## 1. PostgreSQL

- PostgreSQL 14+ recommended.
- Create a database and an application role with read/write on the `public`
  schema (the API creates its module tables on first use and inserts rows
  during normal operation).
- Restore or create the base schema (citizens, users, programs/sub-programs/
  diseases/events, enrollments, worklist_items, outcome tables — see
  [DATABASE.md](DATABASE.md)), then apply the seed scripts in `scripts/` in
  the order given in [INSTALLATION.md](INSTALLATION.md).
- Do **not** run the API as a PostgreSQL superuser.

## 2. Backend (NestJS API)

```bash
cd backend
npm ci
npm run build
NODE_ENV=production node dist/main.js   # or: npm run start:prod
```

Environment (`backend/.env` or process environment):

| Variable | Production guidance |
|----------|--------------------|
| `PORT` | Internal port the API listens on (default 4000; binds 0.0.0.0) |
| `PGHOST` / `PGPORT` / `PGDATABASE` / `PGUSER` / `PGPASSWORD` | Application database role |
| `JWT_SECRET` | **Must** be a long random value unique to the environment |
| `JWT_EXPIRES_IN` | e.g. `8h`; sessions end when the token expires (no refresh tokens) |
| `FRONTEND_ORIGIN` | See CORS warning below |

> ⚠ **CORS is currently hardcoded.** `backend/src/main.ts` allows
> `http://localhost:3000`, `http://127.0.0.1:3000` and one LAN IP; the
> `FRONTEND_ORIGIN` variable is not yet consulted. Before deploying to a real
> domain, add your frontend origin to the `origins` array in `main.ts` (or
> wire it to `FRONTEND_ORIGIN`). This is the one known code edit required for
> a non-localhost deployment.

Run under a process manager (systemd unit, PM2, or equivalent) with restart
on failure. The API is stateless — all state is in PostgreSQL — so it can be
restarted freely and scaled horizontally behind a load balancer if needed.
The in-process scheduler (`@nestjs/schedule`) runs inside the API; if you run
multiple API instances, designate one instance for scheduling or accept
duplicate rule evaluation (rules are written to be idempotent per activity,
but single-instance scheduling is the tested configuration).

## 3. Frontend (Next.js)

```bash
cd frontend
npm ci
NEXT_PUBLIC_API_BASE_URL=https://api.example.org npm run build
npm run start        # serves on port 3000 by default (use -p to change)
```

`NEXT_PUBLIC_API_BASE_URL` is baked in at **build time** — rebuild when it
changes. All routes except the consultation workspace are statically
prerendered; the standard `next start` server serves them.

## 4. Reverse proxy assumptions

The tested topology is a single reverse proxy (nginx/Caddy/IIS ARR)
terminating TLS and routing by path or subdomain:

```
https://dinc.example.org        →  frontend (Next.js, :3000)
https://dinc.example.org/api/*  →  backend  (NestJS,  :4000)   # or api.example.org
```

- The backend already prefixes every route with `/api`, so path-based routing
  needs no rewrite — forward `/api/*` as-is.
- Same-origin deployment (path routing) avoids CORS entirely and is the
  recommended setup; subdomain routing requires the CORS edit above.
- Allow request bodies of at least 10 MB if bulk Excel uploads are used
  (`client_max_body_size` in nginx).
- WebSockets are not used; no special proxy configuration is needed.

## 5. Backups

- **PostgreSQL is the only stateful component.** A nightly `pg_dump` of the
  application database is the minimum; point-in-time recovery (WAL archiving)
  is recommended for production because consultation history is append-only
  and clinically significant.
- Test restores periodically into a staging database.
- Keep `backend/.env` (secrets) in your secret store, not in the repo — the
  repo ships only `.env.example`.
- The frontend has no persistent state; user preferences (sidebar, profile
  display fields) live in browser storage and dashboard layouts live in the
  `dashboard_layouts` table (covered by the database backup).

## 6. Post-deploy smoke test

1. Sign in as an ADMIN account; confirm the Dashboard KPI ribbon loads.
2. Register a test patient and enroll them; confirm the first activity
   appears in the Worklist.
3. Complete a consultation with a severe outcome; confirm the Action Centre
   bell increments and the follow-up activity is created.
4. Open Reports → Clinical Risk and confirm the alert is counted.
5. Sign in as a non-admin role and confirm Administration is absent.
