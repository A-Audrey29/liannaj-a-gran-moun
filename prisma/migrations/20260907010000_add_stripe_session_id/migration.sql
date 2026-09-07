-- AlterTable
ALTER TABLE "PaymentRecord" ADD COLUMN     "stripeSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_stripeSessionId_key" ON "PaymentRecord"("stripeSessionId");

-- Rollback (a executer manuellement si besoin) :
--   DROP INDEX "PaymentRecord_stripeSessionId_key";
--   ALTER TABLE "PaymentRecord" DROP COLUMN "stripeSessionId";
--
-- Migration additive : colonne nullable, aucune donnee existante affectee.
