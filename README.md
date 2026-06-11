# ILA — Inventory & Logistics Automation

A full-stack TypeScript web app for a single company's team to manage inventory,
suppliers & purchase orders, low-stock alerts/reordering, and shipments.

## Stack

| Layer    | Tech                                                         |
|----------|-------------------------------------------------------------|
| Frontend | React + Vite + TypeScript + Tailwind + TanStack Query       |
| Backend  | Node + Express + TypeScript + Prisma                        |
| Database | SQLite (dev) — switchable to PostgreSQL (prod)              |
| Auth     | JWT + bcrypt, roles: `ADMIN` / `MANAGER` / `STAFF`          |

## Project layout

```
apps/
  api/   Express + Prisma API  (http://localhost:4000)
  web/   React + Vite frontend (http://localhost:5173)
```

## Getting started

```bash
npm install            # install all workspaces
npm run db:migrate     # create the SQLite database + tables
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

## Switching to PostgreSQL (production)

1. In `apps/api/prisma/schema.prisma`, set `provider = "postgresql"`.
2. Set `DATABASE_URL` to your Postgres connection string in `apps/api/.env`.
3. Run `npm run db:migrate`.
