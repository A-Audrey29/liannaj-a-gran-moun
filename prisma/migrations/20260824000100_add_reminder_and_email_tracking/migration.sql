-- AlterTable
ALTER TABLE "Intervention" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "emailError" TEXT,
ADD COLUMN     "emailSentAt" TIMESTAMP(3);


-- Rollback (a executer manuellement si besoin) :
--   ALTER TABLE "Intervention" DROP COLUMN "reminderSentAt";
--   ALTER TABLE "Notification" DROP COLUMN "emailError", DROP COLUMN "emailSentAt";
-- Colonnes nullables et sans valeur par defaut : aucune donnee existante n'est
-- modifiee a l'application, et le rollback ne perd que la tracabilite ajoutee.
