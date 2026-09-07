-- CreateTable
CREATE TABLE "ProfilePhoto" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfilePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProfilePhoto_userId_key" ON "ProfilePhoto"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfilePhoto_filename_key" ON "ProfilePhoto"("filename");

-- CreateIndex
CREATE INDEX "ProfilePhoto_filename_idx" ON "ProfilePhoto"("filename");

-- AddForeignKey
ALTER TABLE "ProfilePhoto" ADD CONSTRAINT "ProfilePhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Rollback (a executer manuellement si besoin) :
--   DROP TABLE "ProfilePhoto";
--
-- Migration purement additive : aucune table existante n'est modifiee, et
-- User.profilePhoto reste la cle logique de la photo. Le rollback perd les
-- octets stockes en base, mais ne casse aucune donnee existante.
