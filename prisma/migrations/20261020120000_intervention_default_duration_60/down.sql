-- Rollback manuel (Prisma ne supporte pas les migrations down nativement)
-- A executer avec `psql $DATABASE_URL -f down.sql` si besoin de revenir en arriere.

ALTER TABLE "Intervention" ALTER COLUMN "durationMinutes" SET DEFAULT 120;
