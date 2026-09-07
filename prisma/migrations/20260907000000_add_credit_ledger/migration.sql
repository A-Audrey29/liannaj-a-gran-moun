-- CreateEnum
CREATE TYPE "CreditMovementType" AS ENUM ('PURCHASE', 'CONSUMPTION', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "seniorId" TEXT NOT NULL,
    "type" "CreditMovementType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "triggeredById" TEXT,
    "interventionId" TEXT,
    "paymentRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditLedger_seniorId_idx" ON "CreditLedger"("seniorId");

-- CreateIndex
CREATE INDEX "CreditLedger_seniorId_createdAt_idx" ON "CreditLedger"("seniorId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedger_interventionId_idx" ON "CreditLedger"("interventionId");

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_seniorId_fkey" FOREIGN KEY ("seniorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "Intervention"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_paymentRecordId_fkey" FOREIGN KEY ("paymentRecordId") REFERENCES "PaymentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rollback (a executer manuellement si besoin) :
--   DROP TABLE "CreditLedger";
--   DROP TYPE "CreditMovementType";
--
-- Migration purement additive : aucune table existante n'est modifiee. Le
-- rollback supprime uniquement l'historique des credits (aucune donnee
-- pre-existante ailleurs n'en depend), sans casser User/Intervention/PaymentRecord.
