# Installation

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+ with the DiNC base schema (citizens, users, programs,
  enrollments, worklist, outcomes — see [DATABASE.md](DATABASE.md))
- A database role with read/write access to the `public` schema

The application creates its own module tables on first use
(`CREATE TABLE IF NOT EXISTS` — clinical alerts, care plans, consultation
notes, guidebook versions, scheduler runs, dashboard layouts, duplicate
requests). Reference data is seeded manually (step 3).

## 1. Backend

```bash
cd backend
cp .env.example .env      # then edit with real values
npm install
npm run start:dev         # development, watch mode
```

The API starts on `http://localhost:4000` with the global prefix `/api`.

### Backend `.env`

| Variable          | Description                                        |
|-------------------|----------------------------------------------------|
| `PORT`            | API port (default 4000)                            |
| `FRONTEND_ORIGIN` | Frontend URL (see CORS note in DEPLOYMENT.md)      |
| `PGHOST`          | PostgreSQL host                                    |
| `PGPORT`          | PostgreSQL port                                    |
| `PGDATABASE`      | Database name                                      |
| `PGUSER`          | Database role                                      |
| `PGPASSWORD`      | Database role password                             |
| `JWT_SECRET`      | Long random secret for signing tokens              |
| `JWT_EXPIRES_IN`  | Token lifetime (e.g. `8h`)                         |

> **Note:** allowed CORS origins are currently hardcoded in
> `backend/src/main.ts`. For any origin other than `http://localhost:3000`,
> add it there (see DEPLOYMENT.md).

## 2. Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

The UI starts on `http://localhost:3000`.

### Frontend `.env.local`

| Variable                   | Description                                  |
|----------------------------|----------------------------------------------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend base URL (default `http://localhost:4000`) |

## 3. Seed the database

Apply the SQL scripts in `scripts/` with `psql`, in this order:

```bash
psql -d <database> -f scripts/milestone16a_consultation_foundation.sql
psql -d <database> -f scripts/milestone16d_counselling_seed.sql
psql -d <database> -f scripts/milestone16e_counselling_protocols.sql   # 15 protocols, 101 sections, 424 items
psql -d <database> -f scripts/milestone25_cdse_categories.sql          # CDSE risk categories
psql -d <database> -f scripts/milestone25a_consultation_responses.sql  # consultation_responses + item_key
psql -d <database> -f scripts/milestone20b_dashboard_layouts.sql       # dashboard layout storage
psql -d <database> -f scripts/duplicate_requests.sql                   # data-quality workflow
psql -d <database> -f scripts/workflow_rules_seed.sql                  # workflow engine rules
```

`scripts/update_user_passwords.sql` is an operational helper for resetting
seeded account passwords — review before running.

## 4. Production builds

```bash
cd backend  && npm run build && npm run start:prod   # runs dist/main.js
cd frontend && npm run build && npm run start        # Next.js production server
```

## 5. Verify

1. Open `http://localhost:3000` and sign in with a seeded account.
2. The Dashboard should load with KPI cards and Today's Worklist.
3. Register a test patient (Dashboard → Register Patient), enroll them in a
   program, and confirm the first activity appears in the Worklist.
4. Open the activity's consultation, save an outcome, and confirm the
   follow-up activity and (for severe outcomes) the Action Centre alert.
