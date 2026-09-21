-- CreateEnum
CREATE TYPE "FactoryPlan" AS ENUM ('FREE');

-- AlterTable
ALTER TABLE "Factory" ADD COLUMN     "plan" "FactoryPlan" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "suspendedAt" TIMESTAMP(3);
