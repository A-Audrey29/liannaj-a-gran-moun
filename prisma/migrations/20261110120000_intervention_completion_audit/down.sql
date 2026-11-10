-- Rollback manuel (Prisma ne supporte pas les migrations down nativement)
-- A executer avec `psql $DATABASE_URL -f down.sql` si besoin de revenir en arriere,
-- puis supprimer la ligne correspondante dans "_prisma_migrations".
-- Perte : la trace de qui a clôturé chaque rencontre (le statut et le débit restent).

ALTER TABLE "Intervention" DROP CONSTRAINT "Intervention_completedById_fkey";
ALTER TABLE "Intervention" DROP COLUMN "completedAutomatically",
DROP COLUMN "completedById",
DROP COLUMN "completedAt";
