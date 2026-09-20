# Loom Management — Build Plan

## 1. What we are building

An app for **saree weaving factories** to manage looms, production, stock, workers, and salary.

- **PWA**: a website that installs on a phone like an app. No Play Store needed.
- **Many factories** use the same app. Each factory sees only its own data.
- **Works offline**: a worker can enter data with no internet. It is sent when internet comes back.
- **Languages**: English, Hindi, Marathi. The user can switch.
- **Hosting**: AWS, later. For now everything runs on our own computer.

## 2. Tech stack

Two parts in one repo (pnpm workspace): a frontend that runs in the browser, and a backend API.

**Frontend** (`apps/web`) — plain static files, deployed to S3 + CloudFront.

| Job | Tool |
|---|---|
| App | React + Vite + TypeScript |
| Styling | Tailwind + shadcn/ui |
| PWA / offline | vite-plugin-pwa (Workbox) |
| Phone storage | Dexie (IndexedDB) |
| Data fetching + offline queue | TanStack Query |
| Languages | react-i18next |

**Backend** (`apps/api`) — one container, deployed to App Runner or ECS.

| Job | Tool |
|---|---|
| Server | Fastify + TypeScript |
| Database | PostgreSQL (Docker while developing) |
| Database code | Prisma |
| Login | Better Auth |

**Shared** (`packages/shared`) — types and Zod validation schemas used by both sides.

### Why not Next.js

The whole app sits behind a login, so server rendering and SEO are worth nothing here. Offline-first fights the App Router. And Next.js on AWS needs OpenNext or SST, which costs more than static files plus one container.

### Two hard rules

1. **Money is stored as integer paise**, never decimals. ₹5,000 is `500000`. Floating point rounding turns into owner-vs-worker disputes.
2. **Only production entry works offline. Payments never do.** Workers log inches at the loom with no signal. Payments are made by the owner, who has internet. Offline payments could create two different balances for the same worker.

## 3. Who uses it (roles)

| Role | Can do |
|---|---|
| **Owner** | Everything in their factory. Sees salary and reports. |
| **Supervisor** | Enters production, stock, attendance. Cannot change salary rates. |
| **Worker** | Logs in with phone number + PIN. Enters his own weekly inches. Sees only his own passbook. |
| **Super admin** (you) | Sees all factories. Manages plans. |

## 4. Main data (what we store)

- **Factory** — every other record carries a factory ID. This is the "lock" that keeps data separate.
- **User** — login, role, factory.
- **Loom** — number, type, status (running / stopped / repair), place (in factory / at weaver's home).
- **Saree type** — name, length in inches, usual base price or usual rate per inch.
- **Saree job** — one real saree being woven: worker, loom, start date, finish date, status, and either a base price (per-saree wage) or a rate per inch. The worker on a job can change.
- **Passbook line** — worker, date, amount, section (current work / old balance), kind (work earned / payment / advance given / advance cut / old balance settled / shift adjustment), and the saree job if there is one.
- **Production entry** — date, saree job, inches woven, rate used that day, who entered it, status (approved / waiting for owner). The money is split across the workers on that saree job.
- **Material** — silk yarn, zari, etc. with unit (kg or bundle).
- **Stock movement** — material, kind (bought / given to saree / returned), quantity, price per unit, date, supplier or saree job. Current stock is the sum of movements.
- **Worker** — name, phone, photo, wage type (per saree / per inch). No rate here; the rate lives on the saree.
- **Attendance** — worker, date, present / absent / half day.

## 5. Salary rules

The main way: a **passbook (khata) for each saree**.

- A saree has a **base price**. This is the worker's total wage for weaving it. Example: ₹50,000. A saree can take many months.
- The owner pays the worker some money each month. The amount **can change** each time (₹5,000, then ₹7,000...). It does not depend on how much work was done that month.
- Every payment, and every **advance**, is cut from the base price.
- The app shows: base price, all payments, and **balance still owed**.

Example: base ₹50,000 → pay ₹5,000 → ₹45,000 left → pay ₹7,000 → ₹38,000 left → advance ₹2,000 → ₹36,000 left.

The app does not calculate the pay. It records each payment and shows the balance.

**When the saree is finished**, the balance stays open. The owner may pay it all at once or in two or more parts. The passbook closes when the balance reaches ₹0.

The base price (wage) is **different for every saree**. The owner types it when the saree starts.

**If a per-saree worker is shifted mid-saree** (rare — he usually finishes it), his share is worked out by inches. A saree is generally **216 inches** (can be changed per saree).

- Earned = inches done ÷ saree length × wage. Example: 108 ÷ 216 × ₹50,000 = ₹25,000.
- Compare with money already given. Paid ₹30,000 → he owes the owner ₹5,000. Paid ₹20,000 → owner owes him ₹5,000.
- The difference goes into the **Old balance / advance section** (see below). It is NOT mixed into his next saree. The next saree starts clean at its own wage.
- The next worker who finishes the saree earns the remaining part.
- In the app: a "Shift worker" button. Owner types inches done, the app shows this math, owner confirms.

The passbook follows the **worker**, not the saree.

### Two sections in every passbook

| Section | What it holds |
|---|---|
| **1. Current work** | The saree being woven now (or current inch work), and payments for it |
| **2. Old balance / advance** | Advances taken, and money left over from old sarees, in either direction |

The two sections never mix by themselves. Money moves between them **only when the owner decides**.

Three actions:

1. **Give advance** — goes into Section 2. The current saree's wage is not touched.
2. **Pay worker** — the form has a "Cut for advance" box. Example: work amount ₹5,000, cut for advance ₹2,000, cash given ₹3,000. Section 1 goes down by ₹5,000, Section 2 goes down by ₹2,000. The cut can be ₹0.
   **Rule:** the advance cut **counts as payment** for the work. After the example above, Section 1 shows ₹0 fully paid (₹3,000 cash + ₹2,000 advance cut), never "owner owes ₹2,000". The cash line and the cut line are saved together as one payment, so the two sections can never go out of step.
3. **Settle old balance** — the owner pays old money he owes (for example the ₹5,000 from a shifted saree) from Section 2, whenever he wants.

### Second wage type: per inch

This is for **different workers**. They **also have a passbook (khata)**, same as saree workers.

- The wage is not typed once. It **grows** as the worker weaves: inches × rate per inch.
- **The rate belongs to the saree, not the worker.** Saree A may be ₹300/inch and Saree B ₹500/inch. If the worker is shifted to another saree, his new entries use that saree's rate.
- Each entry **saves the rate used that day**. Changing a saree's rate later does not change old entries.
- Work lines are added automatically from the production entries (Phase 2).
- Payments and advances are cut, the same way as for saree workers.
- Balance = total earned − total paid.

Example: 10 inches on Saree A at ₹300 (+₹3,000) → shifted → 6 inches on Saree B at ₹500 (+₹3,000) → paid ₹4,000 → balance ₹2,000.

### Advances and negative balance

Big advances (₹10,000–20,000) are common and are recovered slowly. Advances live in **Section 2** and show as **"Worker owes ₹X"**. The owner recovers them bit by bit using the "Cut for advance" box when paying. He can still pay the worker each month while the advance shrinks.

### Worker profile

Every worker has a profile page: name, phone, photo, wage type, current saree and loom, full passbook, and one big number on top — who owes whom, and how much.

Each worker has one wage type, set by the owner: **per saree** or **per inch**. Both use the same passbook screen. It replaces the owner's paper notebook.

## 6. Production entry rules

- Weaving is measured **once a week**, not daily. There is **no shift field** — day and night shifts exist but do not matter for the record.
- **Workers enter their own inches** on their own phones.
- Each worker has a **"trusted" switch**, set by the owner:
  - Trusted → the entry is saved right away and the money goes into his passbook.
  - Not trusted → the entry shows as "Waiting for owner". The owner checks the loom, then approves it or fixes the number. Only then does the money go in.
  - The owner or supervisor can also enter inches for anyone.
- For **per-saree workers**, inch entry is optional (needed only for progress, or if he is shifted).
- The weekly entry is **"inches woven this week"** (for example 20). The app adds it to the saree's running total. It warns if the total would go past the saree's length.
- **Two workers can share one saree/loom.** The work money is always divided **half-half**. Each keeps his own passbook and his own advance. Example: 20 inches × ₹300 = ₹6,000 → ₹3,000 each.
- Factory size: usually 20–30 looms, sometimes 50–100. The owner needs a list screen showing every loom, its saree, its workers, and progress (for example 120 / 216 inches).
- Each saree shows a progress bar. At full length the owner taps "Saree finished".

## 7. Stock and materials rules

- Main materials: **silk yarn** (in kg) and **zari** (in bundles, sometimes in kg). Each material has a **unit** (kg or bundle), picked by the owner. Price is per unit.
- The owner often **buys in bulk** for 10–15 looms. One purchase adds to stock; it is then given out to many looms bit by bit.
- Every loom gets material. It is usually given **at the start of a saree**. The "Start saree" form has an optional "Material given" part. Stock goes down by itself.
- **More material can be added later** to the same saree ("Add material" button). Stock goes down again.
- **Leftover material goes back to stock** when the saree is finished ("Return material" button). Stock goes up.
- Sometimes the **weaver buys material himself** and the owner pays him back. The owner records it on the saree with a "Bought by weaver" tick. It adds to the saree's material cost and does not touch factory stock. The owner **picks each time** how to pay it back: **paid in cash now** (just recorded), or **add to the weaver's passbook** under "Old balance" as money the owner owes him, to pay later.
- **Finished sarees list**: every finished saree with weaver, finish date, and status (**in stock / sold** only — no buyer, no selling price for now). Tapping one shows its full story: weavers, time taken, wage, material cost.
- Some looms are **at the weaver's home**. Each loom has a place: in factory / at weaver's home.
- The saree page shows the material that went into it, so the owner can see the material cost of each saree.

Example: stock 30 kg silk, 40 bundles zari → Saree A starts, given 2 kg silk + 3 bundles zari → stock 28 kg, 37 bundles. Material cost of Saree A = 2 × ₹4,500 + 3 × ₹800 = ₹11,400.

## 8. Build phases

Each phase ends with something you can open and test.

### Phase 1 — Foundation
- Set up the project, database, and folder structure.
- Factory sign-up and login.
- Roles and the factory "lock" on all data.
- Language switch (EN / HI / MR) working from the first screen.
- Basic app layout: bottom menu for phones.

### Phase 2 — Looms and production
- Add and edit looms, saree types, and workers (with phone + PIN login and the "trusted" switch).
- Start a saree job: loom, one or two workers, wage or rate per inch, length (216 by default).
- Weekly inch entry by the worker on his phone. Big buttons, very few fields.
- Owner approval list for entries from workers who are not trusted.
- Loom list screen with progress bars. "Saree finished" and "Shift worker" buttons.
- Weekly and monthly reports: per loom, per worker, per saree.

### Phase 3 — Offline
- App installs on the phone (PWA setup).
- Production entry saves on the phone when there is no internet.
- Auto-send when internet returns. Show a clear "waiting to send" badge.
- Rule for clashes: if two people edit the same entry, the newest one wins and the owner can see the history.

### Phase 4 — Stock and materials
- Materials list with unit (kg or bundle).
- Purchase entry (bulk buying), with supplier and price per unit.
- Give material when a saree starts, add more later, return leftovers.
- "Bought by weaver" material, which the owner pays back.
- Low-stock warning and stock report.
- Finished sarees list with status, and the full cost story of each saree.

### Phase 5 — Passbook and payments
- Worker profile page with the two-section passbook (current work / old balance and advance).
- Work money flows in automatically from approved production entries, split when two workers share a saree.
- Three actions: give advance, pay worker (with "cut for advance"), settle old balance.
- One screen for the owner: total owed to all workers, and total advances out.
- Share a worker's passbook as PDF or image on WhatsApp.

### Phase 6 — Business side
- Plans and payment for factories.
- Super admin panel.
- Deploy to AWS.

## 9. Open questions

Stock and materials:
None right now. Wages, production, and stock are all discussed.
