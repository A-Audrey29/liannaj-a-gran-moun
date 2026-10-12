-- Rollback manuel (Prisma ne supporte pas les migrations down nativement)
-- A executer avec `psql $DATABASE_URL -f down.sql` si besoin de revenir en arriere.
--
-- Supprime toutes les reponses NPS : exporter le CSV avant si le financeur a
-- deja recu un bilan. Aucune autre table n'en depend.

DROP TABLE "NpsResponse";
