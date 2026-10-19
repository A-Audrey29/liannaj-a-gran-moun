-- Planning habituel du jeune mémorisé, et date du dernier rappel de fin de
-- disponibilités. Les créneaux datés ne sont générés que pour N semaines :
-- sans le modèle, le jeune devait tout ressaisir pour prolonger, et rien ne
-- le prévenait de la fin.
-- Colonnes nullables : aucune donnée existante à remplir.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "availabilityTemplate" JSONB;
ALTER TABLE "User" ADD COLUMN "availabilityReminderSentAt" TIMESTAMP(3);

-- Rollback : voir down.sql dans ce dossier.
