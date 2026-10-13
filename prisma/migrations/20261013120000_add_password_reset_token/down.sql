-- Rollback manuel (Prisma ne supporte pas les migrations down nativement)
-- A executer avec `psql $DATABASE_URL -f down.sql` si besoin de revenir en arriere.
-- Seuls des jetons temporaires (1 h) sont perdus : les utilisateurs concernes
-- n'ont qu'a refaire une demande.

DROP TABLE "PasswordResetToken";
