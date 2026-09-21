-- CreateEnum
CREATE TYPE "LedgerSection" AS ENUM ('CURRENT_WORK', 'OLD_BALANCE');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('WORK_EARNED', 'PAYMENT_CASH', 'PAYMENT_BY_ADVANCE_CUT', 'ADVANCE_GIVEN', 'ADVANCE_CUT', 'OLD_BALANCE_SETTLED', 'SHIFT_ADJUSTMENT', 'CARRIED_OVER', 'MATERIAL_REIMBURSEMENT');

-- AlterTable
ALTER TABLE "SareeJobWorker" ADD COLUMN     "joinedAtInches" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LedgerLine" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "section" "LedgerSection" NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "sareeJobId" TEXT,
    "productionEntryId" TEXT,
    "groupId" TEXT NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerLine_factoryId_workerId_idx" ON "LedgerLine"("factoryId", "workerId");

-- CreateIndex
CREATE INDEX "LedgerLine_workerId_section_idx" ON "LedgerLine"("workerId", "section");

-- CreateIndex
CREATE INDEX "LedgerLine_sareeJobId_idx" ON "LedgerLine"("sareeJobId");

-- CreateIndex
CREATE INDEX "LedgerLine_groupId_idx" ON "LedgerLine"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerLine_productionEntryId_workerId_key" ON "LedgerLine"("productionEntryId", "workerId");

-- AddForeignKey
ALTER TABLE "LedgerLine" ADD CONSTRAINT "LedgerLine_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLine" ADD CONSTRAINT "LedgerLine_sareeJobId_fkey" FOREIGN KEY ("sareeJobId") REFERENCES "SareeJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
