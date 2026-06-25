# DiNC — Digital Integrated Care Network

**Milestone 1: Login & Authentication**

A monorepo with a NestJS backend and a Next.js frontend. The frontend authenticates
through the backend only; it never connects to PostgreSQL directly. The backend validates
credentials against the existing `public.users` table (read-only) and issues a JWT.

## Structure

- `backend/` — NestJS authentication API (`pg`, `bcrypt`, `@nestjs/jwt`)
- `frontend/` — Next.js login UI + minimal protected `/home` page

## Authentication flow

```
Frontend  →  POST /api/auth/login  →  NestJS  →  SELECT on public.users
          →  bcrypt.compare(password, password_hash)
          →  returns { token, username, full_name, role }
Frontend  →  stores token  →  redirects to /home
/home     →  GET /api/auth/me (Bearer token)  →  JwtAuthGuard verifies  →  displays user
```

## Roles

The backend returns whatever `role` the `users` row holds. Expected values: `ADMIN`,
`CLINICIAN`, `CARE_ASSISTANT`. All authenticated users land on `/home`.

## Guest mode

"Continue as Guest" starts an unauthenticated client-side session. It does **not** call
PostgreSQL, does **not** issue a JWT, and does **not** access protected APIs. It exists only
to demonstrate navigation.

## Scope

This milestone implements login, authentication, JWT handling, protected routing, a minimal
authenticated home page, and logout. No dashboards, worklists, or other application modules.

See `INSTALLATION.md` to run it and `IMPLEMENTATION.md` for design notes.
