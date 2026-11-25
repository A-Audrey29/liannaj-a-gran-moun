-- Rollback manuel (Prisma ne supporte pas les migrations down nativement)
-- A executer avec `psql $DATABASE_URL -f down.sql` si besoin de revenir en arriere,
-- puis supprimer la ligne correspondante dans "_prisma_migrations".
-- Perte : la référence et la note des ajustements admin (les mouvements de
-- crédits et le solde restent).

ALTER TABLE "CreditLedger" DROP COLUMN "adminNote",
DROP COLUMN "externalReference";
