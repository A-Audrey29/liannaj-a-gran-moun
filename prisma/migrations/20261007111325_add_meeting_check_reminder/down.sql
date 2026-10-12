-- Rollback manuel (Prisma ne supporte pas les migrations down nativement)
-- A executer avec `psql $DATABASE_URL -f down.sql` si besoin de revenir en arriere.
-- Teste le 2026-10-12 sur une base locale jetable.
--
-- Postgres ne sait pas retirer une valeur d'enum : le type est recree sans
-- MEETING_CHECK. Les notifications de ce type sont supprimees d'abord, sinon
-- la conversion de colonne echoue.

BEGIN;

DELETE FROM "Notification" WHERE "type" = 'MEETING_CHECK';

ALTER TABLE "Intervention" DROP COLUMN "meetingCheckReminderSentAt";

ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
CREATE TYPE "NotificationType" AS ENUM ('RELATION_REQUEST', 'INTERVENTION_PROPOSED', 'INTERVENTION_CONFIRMED', 'FEEDBACK_REMINDER', 'NEW_MESSAGE', 'SYSTEM');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType" USING "type"::text::"NotificationType";
DROP TYPE "NotificationType_old";

COMMIT;
