-- Gratuité d'une rencontre décidée UNE fois, à la création, et mémorisée.
-- La recalculer à la complétion dépendait de l'ordre de clôture : si une
-- rencontre payante créée après la gratuite était clôturée avant elle, la
-- relation passait ACTIVE et la gratuite était débitée à son tour.

-- AlterTable
ALTER TABLE "Intervention" ADD COLUMN "isFree" BOOLEAN NOT NULL DEFAULT false;

-- Backfill des rencontres encore prévues : même règle que isFreeMeeting
-- (server/storage.ts) — relation en attente de sa 1ère rencontre, 30 min ou
-- moins, aucune rencontre non annulée créée avant elle sur la relation.
-- Les rencontres déjà clôturées n'ont plus besoin du drapeau (leur débit a eu
-- lieu ou non) et restent à false.
UPDATE "Intervention" AS i
SET "isFree" = true
FROM "Relation" AS r
WHERE i."relationId" = r."id"
  AND r."status" = 'PENDING_FIRST_MEETING'
  AND i."durationMinutes" <= 30
  AND i."status" IN ('PROPOSED', 'CONFIRMED')
  AND NOT EXISTS (
    SELECT 1 FROM "Intervention" AS e
    WHERE e."relationId" = i."relationId"
      AND e."status" <> 'CANCELLED'
      AND e."createdAt" < i."createdAt"
  );

-- Rollback : voir down.sql dans ce dossier.
