# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ILA (Inventory & Logistics Automation) is a multi-tenant, full-stack TypeScript web app: companies self-register, then manage inventory, suppliers, purchase orders, and (planned) shipments. See `README.md` for the product overview and demo logins.

## Commands

Run from the repo root (npm workspaces — one install covers both apps):

```bash
npm install              # install all workspaces
npm run dev              # run API (:4000) + web (:5173) together via concurrently
npm run dev:api          # API only
npm run dev:web          # web only (Vite proxies /api -> :4000)
npm run build            # build both apps (this is the type-check gate; see below)

# Database (Prisma, runs in apps/api). Stop the dev server first — see gotcha below.
npm run db:migrate       # prisma migrate dev; add a name with:  npm run db:migrate -- --name my_change
npm run db:seed          # load demo company + users/products/suppliers (fresh DBs)
npm run db:studio        # visual DB browser
npm run db:reset         # DROP + recreate + reseed (destructive; Prisma asks for AI consent)
```

Per-app build/type-check: `npm run build -w @ila/api` (`tsc`) and `npm run build -w @ila/web` (`tsc -b && vite build`).

**There is no automated test suite or linter configured.** The TypeScript compiler is the correctness gate — run the per-app builds to type-check after changes. Behavior is verified by running the app and exercising the API (e.g. with `node` + `fetch` against `http://localhost:4001` on an alternate `PORT`).

## Architecture

Monorepo: `apps/api` (Express + Prisma + SQLite, ESM/NodeNext, run via `tsx`) and `apps/web` (React 18 + Vite + Tailwind v4 + TanStack Query). Schema is the source of truth at `apps/api/prisma/schema.prisma`; SQLite in dev, Postgres-ready by switching the `provider` + `DATABASE_URL`.

These cross-cutting invariants matter more than any single file:

- **Multi-tenancy is the dominant invariant.** Every tenant-owned row carries `companyId` (User, Warehouse, Product, Supplier, PurchaseOrder, Shipment; StockLevel/StockMovement are scoped through their product relation). **Every authenticated query MUST be scoped to `req.user!.companyId`** or it leaks data across companies: reads use `findFirst({ where: { id, companyId } })` (never `findUnique` by id alone), writes inject `companyId` and verify any referenced ids belong to the company (see `assertPoRefs` in `routes/purchaseOrders.ts`, `assertSupplierInCompany` in `routes/products.ts`). Unique constraints are per-company (`@@unique([companyId, sku/code/number])`); `User.email` is the only globally-unique field (one account = one company).

- **Auth.** JWT (Bearer header or `token` cookie) carrying `{ id, email, name, role, companyId }`; `requireAuth` populates `req.user`, `requireRole(...)` gates by role (`ADMIN` | `MANAGER` | `STAFF`). Helpers in `lib/auth.ts`. Public (no-auth) routes: `POST /api/auth/login`, `POST /api/auth/register` (creates a Company + its first ADMIN), and the PO confirmation routes below.

- **Stock changes have exactly one doorway:** `applyStockChange(tx, ...)` in `lib/inventory.ts`. It updates the `StockLevel` and writes a `StockMovement` audit row in the same transaction, and refuses to drive stock negative. Manual adjustments, transfers, and PO receiving all go through it — never mutate `StockLevel` directly.

- **Status/role/type fields are plain `String` columns**, not DB enums, so the schema is portable across SQLite/Postgres. Allowed values live in `apps/api/src/constants.ts` and are enforced with zod at the API layer. Adding a new status value needs **no migration**.

- **Purchase order lifecycle + supplier email.** `DRAFT` → submit (emails the supplier, status → `AWAITING_CONFIRMATION`) → supplier clicks a Confirm/Decline link → `ORDERED` (then receivable) or `DECLINED`; receiving moves to `PARTIALLY_RECEIVED`/`RECEIVED`. The confirm links are public, authorized by a **signed JWT token** (purpose `po-confirm`) — no DB column. Email sending (`lib/email.ts`) defaults to preview mode (`MAIL_TRANSPORT=ethereal`, falling back to offline `json`); set `SMTP_*` in `apps/api/.env` for real delivery. Templates/landing pages in `lib/poEmail.ts`.

- **Gotcha:** `PurchaseOrder` has a `warehouseId` scalar but **no `warehouse` Prisma relation**. Resolve the warehouse in code via the `withWarehouses()` helper in `routes/purchaseOrders.ts` — doing `include: { warehouse }` throws a 500.

- **Errors.** Throw `HttpError` helpers (`notFound`, `badRequest`, `unauthorized`, `forbidden`, `conflict`) from `lib/http.ts`; wrap async handlers in `asyncHandler`; the central `middleware/error.ts` maps `HttpError` and Prisma errors (P2002 → 409, P2025 → 404) to responses. Validate request bodies with `parse(schema, req.body)` from `lib/validate.ts`.

- **Frontend data flow.** `lib/api.ts` is the axios instance that attaches the JWT and redirects to `/login` on 401; `lib/auth.tsx` holds the auth context (login/register/logout, `hasRole`). Server state is TanStack Query (invalidate query keys like `['products']`, `['purchase-orders']`, `['dashboard']` after mutations). Shared types in `src/types.ts`, formatting/status helpers in `lib/format.ts`, UI primitives in `components/ui.tsx`.

## Working with the database (Windows)

The running dev server holds the SQLite file and the Prisma query-engine DLL open. **Stop the dev server before `db:migrate`/`db:generate`** or `prisma generate` fails with `EPERM` (cannot rename the engine DLL) and migrations may hit a lock. For schema changes against a populated DB, follow the established two-step pattern (add the column as optional → backfill data → make it required + add constraints) rather than a single destructive migration — `db:reset` wipes real tenant data.
