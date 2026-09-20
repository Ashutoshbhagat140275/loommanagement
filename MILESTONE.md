# Milestones

Progress tracker. The full design lives in [PLAN.md](PLAN.md).

**Status:** Phase 0 done · Phase 1 API done, web screens left
**Last updated:** 2026-09-20

Run `pnpm db:up` once, then `pnpm dev`. Tests: `pnpm test`.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 0 — Repo setup

- [x] pnpm workspace: `apps/web`, `apps/api`, `packages/shared`
- [x] TypeScript strict config shared from `tsconfig.base.json`
- [x] Prettier config
- [ ] ESLint
- [x] `docker-compose.yml` with PostgreSQL (port 5433)
- [x] `.env.example` and env validation with Zod
- [x] First commit on `main`

## Phase 1 — Foundation

- [x] Prisma schema: factory, user, session, account, worker
- [x] Every query scoped by `factoryId` — `forFactory()` in `apps/api/src/db/tenant.ts`
- [x] Money helpers (paise integers) in `packages/shared`
- [x] Language switch EN / HI / MR, remembered in localStorage
- [x] React shell with Tailwind, talking to the API
- [x] Better Auth: owner sign-up creates a factory; email + password
- [x] Worker login: phone number + PIN
- [x] Roles enforced on routes via `requireRole()`
- [x] Tenant scoping test: factory A cannot read or write factory B's rows
- [x] Public sign-up disabled, so a user without a factory cannot exist
- [ ] Web: sign-up, owner sign-in and worker sign-in screens
- [ ] shadcn/ui set up, bottom navigation
- [ ] Route protection on the web side

## Phase 2 — Looms and production

- [ ] Looms: add, edit, status, place (factory / weaver's home)
- [ ] Saree types and saree jobs (wage or rate per inch, length, default 216)
- [ ] One or two workers per saree job, half-half split
- [ ] Weekly inch entry by the worker; "inches woven this week"
- [ ] Warning if total would exceed saree length
- [ ] `trusted` flag: auto-approve, otherwise owner approval queue
- [ ] Loom list with progress bars
- [ ] "Saree finished" and "Shift worker" (inches ÷ length × wage)
- [ ] Weekly and monthly reports

## Phase 3 — Offline

- [ ] PWA manifest, service worker, install prompt
- [ ] Dexie schema for pending production entries
- [ ] Outbox pattern with client-generated UUIDs; server dedupes
- [ ] "Waiting to send" badge and auto-sync on reconnect
- [ ] Verified: payments stay online-only

## Phase 4 — Stock and materials

- [ ] Materials with unit (kg / bundle) and price per unit
- [ ] Bulk purchase entry with supplier
- [ ] Give material at saree start, add more later, return leftovers
- [ ] "Bought by weaver" material — cash now or into his ledger
- [ ] Low-stock warning and stock report
- [ ] Finished sarees list: in stock / sold, with per-saree cost story

## Phase 5 — Passbook and payments

- [ ] Append-only ledger lines; balance is a sum, never a stored field
- [ ] Two sections: current work, and old balance / advance
- [ ] Work money flows in from approved production entries, split half-half
- [ ] Give advance
- [ ] Pay worker, with "cut for advance" — cash line and cut line saved in one transaction
- [ ] Settle old balance
- [ ] Worker profile page with full passbook
- [ ] Owner summary: total owed to workers, total advances out
- [ ] Share passbook as PDF or image

## Phase 6 — Business side

- [ ] Plans and billing for factories
- [ ] Super admin panel
- [ ] AWS: S3 + CloudFront for web, App Runner or ECS for API, RDS for database
- [ ] CI/CD, backups, monitoring
