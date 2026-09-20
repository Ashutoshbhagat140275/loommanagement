# Milestones

Progress tracker. The full design lives in [PLAN.md](PLAN.md).

**Status:** Phases 0–2 done, apart from saree types, reports and the shift-weaver screen
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
- [x] Web: factory sign-up, owner sign-in, worker sign-in (phone + PIN)
- [x] Route protection and role-aware redirects on the web side
- [x] App shell with bottom navigation; workers list and add-worker form
- [x] shadcn/ui foundation: `components.json`, `@/` alias, `cn()`, Button and Field
      written in shadcn style. No CLI components pulled in yet — nothing needed
      Radix. `pnpm dlx shadcn@latest add <component>` will work when one does.

## Phase 2 — Looms and production

API:

- [x] Looms: add, edit, status, place; number unique per factory
- [x] Saree jobs: one or two weavers, wage or rate per inch, length (216 default)
- [x] Wage and rate are copied onto the job, so editing a template later cannot
      rewrite what a weaver already earned
- [x] Weekly inch entry, filed against the Monday of its week
- [x] One entry per saree per week, so two weavers on one loom cannot file the
      same inches twice
- [x] Refuses more inches than the saree has left, unless confirmed
- [x] `trusted` flag: auto-approve, otherwise the owner's queue (where the
      number can be corrected before approving)
- [x] Progress counts approved entries only
- [x] "Saree finished" and "Shift worker" (inches ÷ length × wage)
- [ ] Saree types (model exists, no routes yet — a job works without one)
- [ ] Weekly and monthly reports

Web:

- [x] Loom list with progress bars
- [x] Add loom, start saree, finish saree
- [x] Weekly inch entry on the weaver's phone, with the overflow confirmation
- [x] Owner approval queue: approve, correct the number, or reject
- [ ] Shift weaver (API done, no screen yet)

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
