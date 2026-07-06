# Implementation Notes

> **Historical document (Milestone 1, authentication only).** Statements
> below describe the original login-only codebase and no longer reflect the
> full platform — the backend now has 19 modules and writes to many tables.
> For current architecture see [ARCHITECTURE.md](ARCHITECTURE.md); kept for
> the auth-flow rationale, which is unchanged.

## Backend (NestJS)

- **DatabaseModule / DatabaseService** — a single `pg` `Pool` built from `backend/.env`.
  Exposes a typed `query()` helper. The pool closes on shutdown. No ORM is used.
- **UsersModule / UsersRepository** — read-only access to `public.users`. The only query is a
  parameterized `SELECT username, password_hash, full_name, role, is_active ... WHERE username = $1`.
  No writes, migrations, or schema changes exist anywhere in the codebase.
- **AuthModule**
  - `AuthService.login()` — fetches the user, rejects missing/inactive accounts and bad
    passwords with a single uniform message, verifies with `bcrypt.compare`, then signs a JWT
    (`{ sub: username, name: full_name, role }`) and returns `{ token, username, full_name, role }`.
  - `JwtAuthGuard` — verifies the `Bearer` token via `@nestjs/jwt` and attaches the payload.
  - `AuthController` — `POST /api/auth/login` (public) and `GET /api/auth/me` (guarded).
- **main.ts** — global `api` prefix, `ValidationPipe`, CORS limited to `FRONTEND_ORIGIN`.

## Frontend (Next.js, App Router)

- **`/` (login)** — role selector + username/password form with show-password, remember-me,
  and a forgot-password notice. On success it stores the session and routes to `/home`.
  Guest mode starts a client-only session and routes to `/home`.
- **`/home` (protected)** — on mount it resolves the session: guest → static guest values;
  token present → calls `/api/auth/me` to confirm the token is still valid; no session →
  redirect to `/`. Displays only welcome, full name, username, role, and logout. No business logic.
- **`lib/api.ts`** — the only place the frontend talks to the backend (`fetch`).
- **`lib/session.ts`** — token/user storage (localStorage when "remember me", otherwise
  sessionStorage) and the guest flag.

## Security choices

- Passwords are never returned to the client; only `token`, `username`, `full_name`, `role`.
- Login failures use one message regardless of cause (no username enumeration).
- The JWT secret and lifetime come from environment variables.
- CORS is restricted to the configured frontend origin.

## Recommendations (not implemented)

These are suggestions for later milestones only:

1. Refresh tokens / token rotation and httpOnly cookie storage.
2. Rate limiting and lockout on repeated failed logins.
3. A real forgot-password flow once user management exists.
4. Role-specific dashboards to replace the temporary `/home` page.
