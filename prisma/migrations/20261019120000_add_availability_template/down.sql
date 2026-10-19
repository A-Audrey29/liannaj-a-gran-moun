-- Rollback manuel (Prisma ne supporte pas les migrations down nativement)
-- A executer avec `psql $DATABASE_URL -f down.sql` si besoin de revenir en arriere.
-- Le code d'avant cette migration n'utilise pas ces colonnes.

ALTER TABLE "User" DROP COLUMN "availabilityReminderSentAt";
ALTER TABLE "User" DROP COLUMN "availabilityTemplate";
