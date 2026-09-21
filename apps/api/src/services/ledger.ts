import { randomUUID } from "node:crypto";
import {
  add,
  multiplyByQuantity,
  paise,
  shiftShare,
  splitEvenly,
  splitPayment,
  type Paise,
} from "@loom/shared";

import type { TenantClient } from "../db/tenant.js";
import type { LedgerLineWhereInput } from "../generated/prisma/models/LedgerLine.js";
import { badRequest, notFound } from "../http/errors.js";

/**
 * Everything that writes money into a weaver's passbook lives here, so the
 * rules are in one file rather than scattered over the routes.
 *
 * Callers pass a transaction: every action writes all its lines or none, so
 * the two sections of a passbook can never be caught half updated.
 */
export type LedgerDb = Pick<
  TenantClient,
  "ledgerLine" | "sareeJobWorker" | "sareeJob" | "worker" | "$queryRaw"
>;

type Actor = { factoryId: string; userId: string };

const PAYMENT_KINDS = ["PAYMENT_CASH", "PAYMENT_BY_ADVANCE_CUT"] as const;

/**
 * Hold this weaver's passbook until the transaction ends.
 *
 * Payments and settlements check a balance and then write against it. Without
 * the lock, two owners paying at once could both pass the check and cut more
 * advance than the weaver owed.
 */
async function lockWorker(db: LedgerDb, actor: Actor, workerId: string) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Worker"
    WHERE id = ${workerId} AND "factoryId" = ${actor.factoryId}
    FOR UPDATE
  `;
  if (rows.length === 0) throw notFound("No such worker");
}

async function sumLines(db: LedgerDb, where: LedgerLineWhereInput): Promise<Paise> {
  const result = await db.ledgerLine.aggregate({ where, _sum: { amountPaise: true } });
  return paise(result._sum.amountPaise ?? 0);
}

export function oldBalanceOf(db: LedgerDb, workerId: string) {
  return sumLines(db, { workerId, section: "OLD_BALANCE" });
}

export function currentWorkOf(db: LedgerDb, workerId: string, sareeJobId: string) {
  return sumLines(db, { workerId, section: "CURRENT_WORK", sareeJobId });
}

/**
 * A per-saree wage is owed from the day the saree starts, and payments count
 * it down: that is how the owner keeps the khata today. Two weavers on the
 * saree hold half each.
 */
export async function creditSareeWage(
  db: LedgerDb,
  actor: Actor,
  input: { sareeJobId: string; wagePaise: number; workerIds: string[] },
) {
  const shares = splitEvenly(paise(input.wagePaise), input.workerIds.length);
  const groupId = randomUUID();

  await db.ledgerLine.createMany({
    data: input.workerIds.map((workerId, index) => ({
      factoryId: actor.factoryId,
      workerId,
      section: "CURRENT_WORK" as const,
      kind: "WORK_EARNED" as const,
      amountPaise: shares[index]!,
      sareeJobId: input.sareeJobId,
      groupId,
      createdByUserId: actor.userId,
    })),
  });
}

/**
 * A per-inch weaver earns when an entry is approved: inches times the rate
 * snapshotted on the entry, split half and half between whoever is on the
 * saree. Per-saree entries earn nothing here; they only move the progress bar.
 *
 * Safe to call twice for the same entry: each weaver can be paid for an entry
 * only once, which the database enforces.
 */
export async function creditEntryEarnings(
  db: LedgerDb,
  actor: Actor,
  entry: {
    id: string;
    sareeJobId: string;
    inches: number;
    ratePerInchPaise: number | null;
  },
) {
  if (entry.ratePerInchPaise === null) return;

  const workers = await db.sareeJobWorker.findMany({
    where: { sareeJobId: entry.sareeJobId, active: true },
    select: { workerId: true },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
  });
  if (workers.length === 0) return;

  const total = multiplyByQuantity(paise(entry.ratePerInchPaise), entry.inches);
  const shares = splitEvenly(total, workers.length);
  const groupId = randomUUID();

  await db.ledgerLine.createMany({
    data: workers.map((worker, index) => ({
      factoryId: actor.factoryId,
      workerId: worker.workerId,
      section: "CURRENT_WORK" as const,
      kind: "WORK_EARNED" as const,
      amountPaise: shares[index]!,
      sareeJobId: entry.sareeJobId,
      productionEntryId: entry.id,
      groupId,
      createdByUserId: actor.userId,
    })),
    skipDuplicates: true,
  });
}

export type ShiftSettlement = {
  wageType: "PER_SAREE" | "PER_INCH";
  inchesDone: number;
  lengthInches: number;
  /** The part of the wage this weaver held. Null for a per-inch weaver. */
  sharePaise: Paise | null;
  earnedPaise: Paise | null;
  /** The part they did not weave. Goes to the replacement, or failing that
   * to whoever carries on with the saree. */
  unearnedPaise: Paise | null;
  paidPaise: Paise;
  /** Moves to the old balance. Positive: owner owes. Negative: weaver owes. */
  carriedPaise: Paise;
  /** Other weavers staying on the saree. With no replacement, they take the
   * unwoven part between them. */
  continuing: { id: string; name: string }[];
};

type ShareLink = {
  workerId: string;
  joinedAtInches: number;
  earnedBeforeJoinPaise: number;
};

/**
 * What a weaver has earned on a per-saree saree so far. Their share is what
 * has been credited to them net of anything taken back; the part banked
 * before they last joined is theirs outright, and the rest is spread over the
 * stretch from that point to the end.
 */
async function perSareeEarnings(
  db: LedgerDb,
  sareeJobId: string,
  link: ShareLink,
  inchesDone: number,
  lengthInches: number,
) {
  const sharePaise = await sumLines(db, {
    workerId: link.workerId,
    sareeJobId,
    section: "CURRENT_WORK",
    kind: { in: ["WORK_EARNED", "SHIFT_ADJUSTMENT"] },
  });
  return {
    sharePaise,
    ...shiftShare({
      sharePaise,
      earnedBeforeJoinPaise: paise(link.earnedBeforeJoinPaise),
      inchesDone,
      inchesAtJoin: link.joinedAtInches,
      lengthInches,
    }),
  };
}

/**
 * What shifting a weaver off a saree would do to their passbook, without
 * doing it. Used both to show the owner the numbers before he agrees and to
 * write them once he does, so the two can never differ.
 */
export async function previewShift(
  db: LedgerDb,
  input: {
    sareeJobId: string;
    workerId: string;
    inchesDone: number;
  },
): Promise<ShiftSettlement> {
  const job = await db.sareeJob.findFirst({
    where: { id: input.sareeJobId },
    select: { wageType: true, wagePaise: true, lengthInches: true },
  });
  if (!job) throw notFound("No such saree");

  const links = await db.sareeJobWorker.findMany({
    where: { sareeJobId: input.sareeJobId, active: true },
    select: {
      workerId: true,
      joinedAtInches: true,
      earnedBeforeJoinPaise: true,
      worker: { select: { name: true } },
    },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
  });
  const link = links.find((item) => item.workerId === input.workerId);
  if (!link) throw notFound("That weaver is not on this saree");
  const continuing = links
    .filter((item) => item.workerId !== input.workerId)
    .map((item) => ({ id: item.workerId, name: item.worker.name }));

  const onJob = { workerId: input.workerId, sareeJobId: input.sareeJobId };
  const balance = await sumLines(db, { ...onJob, section: "CURRENT_WORK" });
  const paidNegative = await sumLines(db, {
    ...onJob,
    section: "CURRENT_WORK",
    kind: { in: [...PAYMENT_KINDS] },
  });
  const paidPaise = paise(-paidNegative);

  if (job.wageType === "PER_INCH") {
    return {
      wageType: "PER_INCH",
      inchesDone: input.inchesDone,
      lengthInches: job.lengthInches,
      sharePaise: null,
      earnedPaise: null,
      unearnedPaise: null,
      paidPaise,
      carriedPaise: balance,
      continuing,
    };
  }

  const { sharePaise, earnedPaise, unearnedPaise } = await perSareeEarnings(
    db,
    input.sareeJobId,
    link,
    input.inchesDone,
    job.lengthInches,
  );

  return {
    wageType: "PER_SAREE",
    inchesDone: input.inchesDone,
    lengthInches: job.lengthInches,
    sharePaise,
    earnedPaise,
    unearnedPaise,
    paidPaise,
    // After the unwoven part is taken back, what is left on this saree.
    carriedPaise: paise(balance - unearnedPaise),
    continuing,
  };
}

/**
 * Take a weaver off a saree and settle it in their passbook.
 *
 * The unwoven part of a per-saree wage is taken back, and whatever is left on
 * the saree, owed either way, moves to their old balance. The saree does not
 * follow them: their next one starts clean at its own wage.
 *
 * The unwoven part goes to the replacement if the owner named one. If not,
 * whoever stays on the saree carries on alone and takes it, as the owner
 * decided. Each of them has their share re-based at this point, so that if
 * they are shifted later too, the sum still comes out exact.
 */
export async function applyShift(
  db: LedgerDb,
  actor: Actor,
  input: {
    sareeJobId: string;
    workerId: string;
    inchesDone: number;
    replacementWorkerId: string | null;
  },
): Promise<ShiftSettlement> {
  await lockWorker(db, actor, input.workerId);
  const settlement = await previewShift(db, input);
  const groupId = randomUUID();

  const line = (fields: {
    workerId: string;
    section: "CURRENT_WORK" | "OLD_BALANCE";
    kind: "SHIFT_ADJUSTMENT" | "CARRIED_OVER" | "WORK_EARNED";
    amountPaise: number;
    onSaree: boolean;
  }) => ({
    factoryId: actor.factoryId,
    workerId: fields.workerId,
    section: fields.section,
    kind: fields.kind,
    amountPaise: fields.amountPaise,
    sareeJobId: fields.onSaree ? input.sareeJobId : null,
    groupId,
    createdByUserId: actor.userId,
  });

  const lines = [];

  if (settlement.unearnedPaise !== null && settlement.unearnedPaise !== 0) {
    lines.push(
      line({
        workerId: input.workerId,
        section: "CURRENT_WORK",
        kind: "SHIFT_ADJUSTMENT",
        amountPaise: -settlement.unearnedPaise,
        onSaree: true,
      }),
    );
  }

  if (settlement.carriedPaise !== 0) {
    lines.push(
      line({
        workerId: input.workerId,
        section: "CURRENT_WORK",
        kind: "CARRIED_OVER",
        amountPaise: -settlement.carriedPaise,
        onSaree: true,
      }),
      line({
        workerId: input.workerId,
        section: "OLD_BALANCE",
        kind: "CARRIED_OVER",
        amountPaise: settlement.carriedPaise,
        onSaree: false,
      }),
    );
  }

  const unearned = settlement.unearnedPaise ?? paise(0);

  // Close the leaving weaver's place on the saree.
  await db.sareeJobWorker.updateMany({
    where: { sareeJobId: input.sareeJobId, workerId: input.workerId, active: true },
    data: { active: false, leftAt: new Date(), leftAtInches: input.inchesDone },
  });

  if (input.replacementWorkerId) {
    // A replacement joins here. Anything they earned on this saree before, in
    // an earlier stint, is banked; their new share covers from here to the end.
    const bankedBefore = await sumLines(db, {
      workerId: input.replacementWorkerId,
      sareeJobId: input.sareeJobId,
      section: "CURRENT_WORK",
      kind: { in: ["WORK_EARNED", "SHIFT_ADJUSTMENT"] },
    });
    await db.sareeJobWorker.upsert({
      where: {
        sareeJobId_workerId: {
          sareeJobId: input.sareeJobId,
          workerId: input.replacementWorkerId,
        },
      },
      create: {
        factoryId: actor.factoryId,
        sareeJobId: input.sareeJobId,
        workerId: input.replacementWorkerId,
        joinedAtInches: input.inchesDone,
        earnedBeforeJoinPaise: bankedBefore,
      },
      update: {
        active: true,
        leftAt: null,
        leftAtInches: null,
        joinedAtInches: input.inchesDone,
        earnedBeforeJoinPaise: bankedBefore,
      },
    });

    if (unearned > 0) {
      lines.push(
        line({
          workerId: input.replacementWorkerId,
          section: "CURRENT_WORK",
          kind: "WORK_EARNED",
          amountPaise: unearned,
          onSaree: true,
        }),
      );
    }
  } else if (unearned > 0 && settlement.continuing.length > 0) {
    // Nobody replaces them: whoever stays finishes the saree alone and takes
    // the unwoven part. Re-base each of them first, banking what they have
    // earned so far, so their larger share is spread over what is left.
    const job = await db.sareeJob.findFirst({
      where: { id: input.sareeJobId },
      select: { lengthInches: true },
    });
    const shares = splitEvenly(unearned, settlement.continuing.length);

    for (const [index, stayer] of settlement.continuing.entries()) {
      const link = await db.sareeJobWorker.findFirst({
        where: { sareeJobId: input.sareeJobId, workerId: stayer.id, active: true },
        select: { workerId: true, joinedAtInches: true, earnedBeforeJoinPaise: true },
      });
      if (!link || !job) continue;

      const { earnedPaise } = await perSareeEarnings(
        db,
        input.sareeJobId,
        link,
        input.inchesDone,
        job.lengthInches,
      );

      await db.sareeJobWorker.updateMany({
        where: { sareeJobId: input.sareeJobId, workerId: stayer.id, active: true },
        data: { joinedAtInches: input.inchesDone, earnedBeforeJoinPaise: earnedPaise },
      });

      lines.push(
        line({
          workerId: stayer.id,
          section: "CURRENT_WORK",
          kind: "WORK_EARNED",
          amountPaise: shares[index]!,
          onSaree: true,
        }),
      );
    }
  }

  if (lines.length > 0) await db.ledgerLine.createMany({ data: lines });
  return settlement;
}

export async function giveAdvance(
  db: LedgerDb,
  actor: Actor,
  input: { workerId: string; amountPaise: number; note: string | null },
) {
  await lockWorker(db, actor, input.workerId);
  await db.ledgerLine.create({
    data: {
      factoryId: actor.factoryId,
      workerId: input.workerId,
      section: "OLD_BALANCE",
      kind: "ADVANCE_GIVEN",
      amountPaise: -input.amountPaise,
      groupId: randomUUID(),
      note: input.note,
      createdByUserId: actor.userId,
    },
  });
}

/**
 * Pay a weaver against one saree.
 *
 * The advance cut counts as payment. Paying Rs 5,000 of work as Rs 3,000 cash
 * and a Rs 2,000 cut clears Rs 5,000 from the saree and Rs 2,000 from the
 * advance; the saree never shows the owner still owing Rs 2,000.
 */
export async function payWorker(
  db: LedgerDb,
  actor: Actor,
  input: {
    workerId: string;
    sareeJobId: string;
    workAmountPaise: number;
    cutForAdvancePaise: number;
    note: string | null;
  },
) {
  await lockWorker(db, actor, input.workerId);

  const everOnSaree = await db.sareeJobWorker.findFirst({
    where: { sareeJobId: input.sareeJobId, workerId: input.workerId },
    select: { id: true },
  });
  if (!everOnSaree)
    throw badRequest("NOT_ON_SAREE", "This weaver never worked on that saree");

  const { cashPaise, cutPaise } = splitPayment({
    workAmountPaise: paise(input.workAmountPaise),
    cutForAdvancePaise: paise(input.cutForAdvancePaise),
  });

  if (cutPaise > 0) {
    const owed = -(await oldBalanceOf(db, input.workerId));
    if (cutPaise > owed) {
      throw badRequest(
        "CUT_MORE_THAN_ADVANCE",
        owed > 0
          ? `The weaver only owes ${owed} paise of advance`
          : "The weaver has no advance to cut",
      );
    }
  }

  const groupId = randomUUID();
  const base = {
    factoryId: actor.factoryId,
    workerId: input.workerId,
    groupId,
    note: input.note,
    createdByUserId: actor.userId,
  };

  const lines = [];
  if (cashPaise > 0) {
    lines.push({
      ...base,
      section: "CURRENT_WORK" as const,
      kind: "PAYMENT_CASH" as const,
      amountPaise: -cashPaise,
      sareeJobId: input.sareeJobId,
    });
  }
  if (cutPaise > 0) {
    lines.push(
      {
        ...base,
        section: "CURRENT_WORK" as const,
        kind: "PAYMENT_BY_ADVANCE_CUT" as const,
        amountPaise: -cutPaise,
        sareeJobId: input.sareeJobId,
      },
      {
        ...base,
        section: "OLD_BALANCE" as const,
        kind: "ADVANCE_CUT" as const,
        amountPaise: cutPaise,
        sareeJobId: null,
      },
    );
  }

  await db.ledgerLine.createMany({ data: lines });
  return { cashPaise, cutPaise, groupId };
}

/**
 * A weaver bought material for a saree with his own money and the owner chose
 * to pay him back later: it goes into his old balance as owed to him, and is
 * paid off like any other old balance.
 */
export async function creditMaterialReimbursement(
  db: LedgerDb,
  actor: Actor,
  input: { workerId: string; amountPaise: number; note: string | null },
) {
  await lockWorker(db, actor, input.workerId);
  await db.ledgerLine.create({
    data: {
      factoryId: actor.factoryId,
      workerId: input.workerId,
      section: "OLD_BALANCE",
      kind: "MATERIAL_REIMBURSEMENT",
      amountPaise: input.amountPaise,
      groupId: randomUUID(),
      note: input.note,
      createdByUserId: actor.userId,
    },
  });
}

/** The owner paying off what he owes from an old saree. */
export async function settleOldBalance(
  db: LedgerDb,
  actor: Actor,
  input: { workerId: string; amountPaise: number; note: string | null },
) {
  await lockWorker(db, actor, input.workerId);

  const owed = await oldBalanceOf(db, input.workerId);
  if (input.amountPaise > owed) {
    throw badRequest(
      "SETTLE_MORE_THAN_OWED",
      owed > 0
        ? `Only ${owed} paise of old balance is owed to this weaver`
        : "Nothing is owed to this weaver from old sarees",
    );
  }

  await db.ledgerLine.create({
    data: {
      factoryId: actor.factoryId,
      workerId: input.workerId,
      section: "OLD_BALANCE",
      kind: "OLD_BALANCE_SETTLED",
      amountPaise: -input.amountPaise,
      groupId: randomUUID(),
      note: input.note,
      createdByUserId: actor.userId,
    },
  });
}

/** A whole passbook: both sections, their balances, and every line. */
export async function readPassbook(db: LedgerDb, workerId: string) {
  const worker = await db.worker.findFirst({
    where: { id: workerId },
    select: { id: true, name: true, phone: true, wageType: true, trusted: true },
  });
  if (!worker) throw notFound("No such worker");

  const lines = await db.ledgerLine.findMany({
    where: { workerId },
    select: {
      id: true,
      section: true,
      kind: true,
      amountPaise: true,
      sareeJobId: true,
      productionEntryId: true,
      groupId: true,
      note: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const oldBalancePaise = paise(
    lines
      .filter((line) => line.section === "OLD_BALANCE")
      .reduce((sum, line) => sum + line.amountPaise, 0),
  );

  const perSaree = new Map<string, number>();
  for (const line of lines) {
    if (line.section !== "CURRENT_WORK" || !line.sareeJobId) continue;
    perSaree.set(
      line.sareeJobId,
      (perSaree.get(line.sareeJobId) ?? 0) + line.amountPaise,
    );
  }

  const sarees = await db.sareeJob.findMany({
    where: { id: { in: [...perSaree.keys()] } },
    select: {
      id: true,
      label: true,
      status: true,
      wageType: true,
      startedAt: true,
      loom: { select: { number: true } },
      sareeType: { select: { name: true } },
      workers: {
        where: { workerId },
        select: { active: true },
      },
    },
  });

  const currentWork = sarees
    .map((saree) => ({
      sareeJobId: saree.id,
      label: saree.label ?? saree.sareeType?.name ?? null,
      loomNumber: saree.loom.number,
      status: saree.status,
      wageType: saree.wageType,
      startedAt: saree.startedAt,
      /** False once the weaver has been shifted off it. */
      stillOnIt: saree.workers.some((link) => link.active),
      balancePaise: paise(perSaree.get(saree.id) ?? 0),
    }))
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  const currentWorkPaise = add(...currentWork.map((saree) => saree.balancePaise));

  return {
    worker,
    oldBalancePaise,
    currentWorkPaise,
    netPaise: add(currentWorkPaise, oldBalancePaise),
    currentWork,
    lines,
  };
}
