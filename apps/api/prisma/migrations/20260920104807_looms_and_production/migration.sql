-- CreateEnum
CREATE TYPE "LoomStatus" AS ENUM ('RUNNING', 'STOPPED', 'REPAIR');

-- CreateEnum
CREATE TYPE "LoomPlace" AS ENUM ('IN_FACTORY', 'AT_WEAVER_HOME');

-- CreateEnum
CREATE TYPE "SareeJobStatus" AS ENUM ('RUNNING', 'FINISHED');

-- CreateEnum
CREATE TYPE "ProductionEntryStatus" AS ENUM ('APPROVED', 'AWAITING_OWNER');

-- CreateTable
CREATE TABLE "Loom" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "LoomStatus" NOT NULL DEFAULT 'RUNNING',
    "place" "LoomPlace" NOT NULL DEFAULT 'IN_FACTORY',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SareeType" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lengthInches" INTEGER NOT NULL DEFAULT 216,
    "defaultWagePaise" INTEGER,
    "defaultRatePerInchPaise" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SareeType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SareeJob" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "loomId" TEXT NOT NULL,
    "sareeTypeId" TEXT,
    "label" TEXT,
    "lengthInches" INTEGER NOT NULL,
    "wageType" "WageType" NOT NULL,
    "wagePaise" INTEGER,
    "ratePerInchPaise" INTEGER,
    "status" "SareeJobStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SareeJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SareeJobWorker" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "sareeJobId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "leftAtInches" INTEGER,

    CONSTRAINT "SareeJobWorker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionEntry" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "sareeJobId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "inches" INTEGER NOT NULL,
    "ratePerInchPaise" INTEGER,
    "status" "ProductionEntryStatus" NOT NULL,
    "enteredByUserId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Loom_factoryId_idx" ON "Loom"("factoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Loom_factoryId_number_key" ON "Loom"("factoryId", "number");

-- CreateIndex
CREATE INDEX "SareeType_factoryId_idx" ON "SareeType"("factoryId");

-- CreateIndex
CREATE UNIQUE INDEX "SareeType_factoryId_name_key" ON "SareeType"("factoryId", "name");

-- CreateIndex
CREATE INDEX "SareeJob_factoryId_status_idx" ON "SareeJob"("factoryId", "status");

-- CreateIndex
CREATE INDEX "SareeJob_loomId_idx" ON "SareeJob"("loomId");

-- CreateIndex
CREATE INDEX "SareeJobWorker_factoryId_idx" ON "SareeJobWorker"("factoryId");

-- CreateIndex
CREATE INDEX "SareeJobWorker_workerId_idx" ON "SareeJobWorker"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "SareeJobWorker_sareeJobId_workerId_key" ON "SareeJobWorker"("sareeJobId", "workerId");

-- CreateIndex
CREATE INDEX "ProductionEntry_factoryId_status_idx" ON "ProductionEntry"("factoryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionEntry_sareeJobId_weekStart_key" ON "ProductionEntry"("sareeJobId", "weekStart");

-- AddForeignKey
ALTER TABLE "Loom" ADD CONSTRAINT "Loom_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SareeType" ADD CONSTRAINT "SareeType_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SareeJob" ADD CONSTRAINT "SareeJob_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SareeJob" ADD CONSTRAINT "SareeJob_loomId_fkey" FOREIGN KEY ("loomId") REFERENCES "Loom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SareeJob" ADD CONSTRAINT "SareeJob_sareeTypeId_fkey" FOREIGN KEY ("sareeTypeId") REFERENCES "SareeType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SareeJobWorker" ADD CONSTRAINT "SareeJobWorker_sareeJobId_fkey" FOREIGN KEY ("sareeJobId") REFERENCES "SareeJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SareeJobWorker" ADD CONSTRAINT "SareeJobWorker_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_sareeJobId_fkey" FOREIGN KEY ("sareeJobId") REFERENCES "SareeJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
