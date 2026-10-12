-- Rollback manuel (Prisma ne supporte pas les migrations down nativement)
-- A executer avec `psql $DATABASE_URL -f down.sql` si besoin de revenir en arriere.
-- Le code d'avant cette migration recalcule la gratuite a la completion.

ALTER TABLE "Intervention" DROP COLUMN "isFree";
