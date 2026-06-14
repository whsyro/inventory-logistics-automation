# ILA — Inventory & Logistics Automation

A full-stack TypeScript web app for a single company's team to manage inventory,
suppliers & purchase orders, low-stock alerts/reordering, and shipments.

## Stack

| Layer    | Tech                                                         |
|----------|-------------------------------------------------------------|
| Frontend | React + Vite + TypeScript + Tailwind + TanStack Query       |
| Backend  | Node + Express + TypeScript + Prisma                        |
| Database | PostgreSQL (hosted on Supabase) via Prisma                  |
| Auth     | JWT + bcrypt, roles: `ADMIN` / `MANAGER` / `STAFF`          |

## Project layout

```
apps/
  api/   Express + Prisma API  (http://localhost:4000)
  web/   React + Vite frontend (http://localhost:5173)
```

## Getting started

First, create a [Supabase](https://supabase.com) project and copy `apps/api/.env.example`
to `apps/api/.env`, filling in `DATABASE_URL` + `DIRECT_URL` from the dashboard
(**Connect → ORMs → Prisma**). Then:

```bash
npm install            # install all workspaces
npm run db:migrate     # create the Postgres schema (first run: prompts for a name)
npm run db:seed        # load demo users, products, suppliers, etc.
npm run dev            # start API + web together
```

Then open http://localhost:5173.

### Demo logins (after seeding)

| Email                 | Password    | Role    |
|-----------------------|-------------|---------|
| admin@ila.local       | password123 | ADMIN   |
| manager@ila.local     | password123 | MANAGER |
| staff@ila.local       | password123 | STAFF   |

## Useful scripts

| Command            | What it does                              |
|--------------------|-------------------------------------------|
| `npm run dev`      | Run API + web concurrently                |
| `npm run db:studio`| Open Prisma Studio (visual DB browser)    |
| `npm run build`    | Build both apps for production            |

## Database (Supabase Postgres)

The app uses two connection strings (both from **Connect → ORMs → Prisma** in the
Supabase dashboard), set in `apps/api/.env`:

- `DATABASE_URL` — the **pooled** connection (Supavisor, port `6543`, `?pgbouncer=true`).
  Used by the running app.
- `DIRECT_URL` — the **direct** connection (port `5432`). Used only by Prisma Migrate.

Run migrations with `npm run db:migrate` and reseed with `npm run db:seed`. To go back
to a zero-setup local SQLite database, set `provider = "sqlite"` in
`prisma/schema.prisma` and point `DATABASE_URL` at `file:./dev.db`.
