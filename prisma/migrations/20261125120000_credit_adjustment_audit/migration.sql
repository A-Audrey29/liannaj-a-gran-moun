-- Ajustement manuel des crédits par un admin (ex. après un remboursement
-- Mollie) : on garde la référence de l'opération chez le prestataire et la
-- raison donnée par l'admin. Colonnes nullables : aucune donnée existante
-- n'est modifiée.

-- AlterTable
ALTER TABLE "CreditLedger" ADD COLUMN "externalReference" TEXT,
ADD COLUMN "adminNote" TEXT;

-- Rollback : voir down.sql dans ce dossier.
