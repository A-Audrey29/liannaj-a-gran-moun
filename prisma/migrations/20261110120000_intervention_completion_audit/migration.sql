-- Clôture des rencontres par le senior / l'aidant, ou automatiquement 48h
-- après la fin. On garde qui a clôturé et quand, pour le contrôle admin.
-- Colonnes nullables / avec défaut : aucune donnée existante n'est modifiée.

-- AlterTable
ALTER TABLE "Intervention" ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "completedById" TEXT,
ADD COLUMN "completedAutomatically" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rollback : voir down.sql dans ce dossier.
