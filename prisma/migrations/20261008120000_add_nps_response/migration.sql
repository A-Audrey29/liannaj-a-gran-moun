-- CreateTable
CREATE TABLE "NpsResponse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "score" SMALLINT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NpsResponse_pkey" PRIMARY KEY ("id"),
    -- Prisma cannot express these two rules; the DB enforces them so a manual
    -- fix or a future code path cannot skew the figures sent to the funder.
    CONSTRAINT "NpsResponse_score_range" CHECK ("score" BETWEEN 0 AND 10),
    CONSTRAINT "NpsResponse_role_surveyed" CHECK ("role" IN ('SENIOR', 'REFERENT_SENIOR'))
);

-- CreateIndex
CREATE INDEX "NpsResponse_userId_createdAt_idx" ON "NpsResponse"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NpsResponse_createdAt_idx" ON "NpsResponse"("createdAt");

-- AddForeignKey
ALTER TABLE "NpsResponse" ADD CONSTRAINT "NpsResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rollback (a executer manuellement si besoin) :
--   DROP TABLE "NpsResponse";
--
-- Migration purement additive : aucune table existante n'est modifiee. Le
-- rollback supprime uniquement les reponses NPS (aucune autre table n'en
-- depend). A exporter avant si le financeur a deja recu un bilan.
