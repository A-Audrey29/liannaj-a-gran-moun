-- Rollback manuel (Prisma ne supporte pas les migrations down nativement)
-- A executer avec `psql $DATABASE_URL -f down.sql` si besoin de revenir en arriere.
-- Seules les dates de derniere connexion et d'avertissement sont perdues ;
-- aucun compte n'est touche. Supprimer ensuite la ligne correspondante de
-- _prisma_migrations si la migration avait ete appliquee.

ALTER TABLE "User" DROP COLUMN "lastLoginAt",
DROP COLUMN "inactivityWarnedAt";
