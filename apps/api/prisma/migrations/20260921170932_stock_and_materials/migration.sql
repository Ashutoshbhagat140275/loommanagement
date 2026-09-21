-- CreateEnum
CREATE TYPE "MaterialUnit" AS ENUM ('KG', 'BUNDLE');

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('PURCHASE', 'GIVEN_TO_SAREE', 'RETURNED_FROM_SAREE', 'BOUGHT_BY_WEAVER');

-- CreateEnum
CREATE TYPE "ReimbursementMethod" AS ENUM ('CASH_NOW', 'INTO_PASSBOOK');

-- CreateEnum
CREATE TYPE "FinishedSareeStatus" AS ENUM ('IN_STOCK', 'SOLD');

-- AlterTable
ALTER TABLE "SareeJob" ADD COLUMN     "saleStatus" "FinishedSareeStatus",
ADD COLUMN     "soldAt" TIMESTAMP(3);

-- Sarees finished before this change are sitting in the store room as far as
-- anyone knows, so they join the finished-sarees list as in stock.
UPDATE "SareeJob" SET "saleStatus" = 'IN_STOCK' WHERE "status" = 'FINISHED';

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "MaterialUnit" NOT NULL,
    "lowStockAtMilli" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "factoryId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "kind" "StockMovementKind" NOT NULL,
    "quantityMilli" INTEGER NOT NULL,
    "costPaise" INTEGER,
    "supplier" TEXT,
    "sareeJobId" TEXT,
    "workerId" TEXT,
    "reimbursement" "ReimbursementMethod",
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Material_factoryId_idx" ON "Material"("factoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_factoryId_name_key" ON "Material"("factoryId", "name");

-- CreateIndex
CREATE INDEX "StockMovement_factoryId_materialId_idx" ON "StockMovement"("factoryId", "materialId");

-- CreateIndex
CREATE INDEX "StockMovement_sareeJobId_idx" ON "StockMovement"("sareeJobId");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_sareeJobId_fkey" FOREIGN KEY ("sareeJobId") REFERENCES "SareeJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
