-- Suivi d'inactivite des comptes (conservation des donnees, RGPD).
-- Migration purement additive : deux colonnes nullables, aucune donnee modifiee.
-- Pas de backfill : l'inactivite se calcule avec COALESCE("lastLoginAt", "createdAt").

-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "inactivityWarnedAt" TIMESTAMP(3);

-- Rollback : voir down.sql dans ce dossier.
