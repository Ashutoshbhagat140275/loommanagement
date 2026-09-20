-- Phone-generated id so a retry after a lost reply does not file a week twice.
-- Existing rows keep NULL, and Postgres allows many NULLs under a unique index,
-- so adding the constraint cannot fail on data already stored.
ALTER TABLE "ProductionEntry" ADD COLUMN "clientId" TEXT;

CREATE UNIQUE INDEX "ProductionEntry_factoryId_clientId_key"
  ON "ProductionEntry"("factoryId", "clientId");
