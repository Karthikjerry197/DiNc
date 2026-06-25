# Installation

## Prerequisites

- Node.js 18+ and npm
- Access to the existing PostgreSQL database (a role with `SELECT` on `public.users`)

The schema, users, and data already exist. No migrations or seeds are run.

## 1. Backend

```bash
cd backend
cp .env.example .env
# edit .env with real PostgreSQL connection values and a JWT secret
npm install
npm run start:dev
```

The API starts on `http://localhost:4000` (prefix `/api`).

### Backend `.env`

| Variable          | Description                                  |
|-------------------|----------------------------------------------|
| `PORT`            | API port (default 4000)                      |
| `FRONTEND_ORIGIN` | Allowed CORS origin (the frontend URL)       |
| `PGHOST`          | PostgreSQL host                              |
| `PGPORT`          | PostgreSQL port                              |
| `PGDATABASE`      | Database name                                |
| `PGUSER`          | DB role (needs `SELECT` on `public.users`)   |
| `PGPASSWORD`      | DB role password                             |
| `JWT_SECRET`      | Long random secret for signing tokens        |
| `JWT_EXPIRES_IN`  | Token lifetime (e.g. `8h`)                   |

## 2. Frontend

```bash
cd frontend
cp .env.local.example .env.local
# ensure NEXT_PUBLIC_API_BASE_URL points at the backend (default http://localhost:4000)
npm install
npm run dev
```

The UI starts on `http://localhost:3000`.

## 3. Verify

1. Open `http://localhost:3000`.
2. Pick a role, enter a valid username/password from the `users` table, click **Sign In**.
3. You are redirected to `/home` showing your full name, username, and role.
4. Click **Logout** to return to the login screen.
5. "Continue as Guest" navigates to `/home` in an unauthenticated session.
