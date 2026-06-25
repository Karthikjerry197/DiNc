# Changelog

## [1.0.0] — Milestone 1: Login & Authentication

### Added
- New `DiNC` monorepo (`backend/` NestJS, `frontend/` Next.js).
- Backend `pg` connection pool driven entirely by `backend/.env`.
- Read-only `UsersRepository` against the existing `public.users` table.
- `POST /api/auth/login` — `bcrypt.compare` against `password_hash`; returns
  `{ token, username, full_name, role }`.
- JWT issuance via `@nestjs/jwt` and a `JwtAuthGuard` protecting `GET /api/auth/me`.
- CORS restricted to the configured frontend origin.
- Frontend login page (role selector, show-password, remember-me, forgot-password notice)
  re-branded to "Digital Integrated Care Network (DiNC) · Public Health Operations Platform".
- Unauthenticated guest navigation (no JWT, no database, no protected API access).
- Minimal protected `/home` page (welcome, full name, username, role, logout) with
  client-side protected routing.
- Documentation: `README.md`, `INSTALLATION.md`, `IMPLEMENTATION.md`, `CHANGELOG.md`.

### Notes
- No database schema changes, migrations, seed data, or record modifications.
- The supplied HTML reference and PostgreSQL schema were used for reference only and left untouched.
