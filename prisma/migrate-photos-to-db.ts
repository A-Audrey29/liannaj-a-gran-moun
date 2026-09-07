/**
 * Importe en base les photos de profil encore stockees sur le disque.
 *
 * Script ponctuel, a lancer une fois par environnement apres le deploiement
 * de la bascule. Il est ADDITIF et rejouable : il ne supprime aucun fichier et
 * ignore les utilisateurs dont la photo est deja en base.
 *
 * Usage :
 *   npx tsx prisma/migrate-photos-to-db.ts            # simulation
 *   npx tsx prisma/migrate-photos-to-db.ts --apply    # ecrit reellement
 *
 * Une fois la migration faite et verifiee sur tous les environnements, le
 * dossier uploads/ peut etre supprime, ainsi que la branche de compatibilite
 * disque dans la route GET /api/photos/:filename.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DOSSIER_UPLOADS = path.join(process.cwd(), "uploads");
const TAILLE_MAX_PX = 800;
const APPLIQUER = process.argv.includes("--apply");

async function main() {
  if (!APPLIQUER) {
    console.log("[PHOTOS] Mode simulation. Ajouter --apply pour ecrire en base.\n");
  }

  const utilisateurs = await prisma.user.findMany({
    where: { profilePhoto: { not: null } },
    select: { id: true, email: true, profilePhoto: true, photo: { select: { id: true } } },
  });

  let importees = 0;
  let deja = 0;
  let externes = 0;
  let introuvables = 0;
  let erreurs = 0;

  for (const u of utilisateurs) {
    if (u.photo) {
      deja++;
      continue;
    }

    // Les jeux de donnees de demonstration referencent des avatars distants
    // (ui-avatars.com). Ce ne sont pas des fichiers locaux : rien a importer,
    // et le client les sert tels quels puisque getPhotoUrl() ne reecrit que
    // les chemins commencant par /uploads/.
    if (!u.profilePhoto!.startsWith("/uploads/")) {
      externes++;
      continue;
    }

    const nomFichier = u.profilePhoto!.replace(/^\/uploads\//, "");
    const chemin = path.join(DOSSIER_UPLOADS, nomFichier);

    if (!fs.existsSync(chemin)) {
      // Cas attendu en production : le fichier a deja disparu lors d'un
      // redeploiement precedent. C'est precisement le probleme que la
      // bascule en base resout.
      console.warn(`[PHOTOS] Fichier absent pour ${u.email} : ${nomFichier}`);
      introuvables++;
      continue;
    }

    try {
      const brut = fs.readFileSync(chemin);
      const type = await fileTypeFromBuffer(brut);
      if (!type || !["image/jpeg", "image/png", "image/webp"].includes(type.mime)) {
        console.warn(`[PHOTOS] Format non reconnu pour ${u.email} : ${nomFichier}`);
        erreurs++;
        continue;
      }

      const data = await sharp(brut)
        .rotate()
        .resize(TAILLE_MAX_PX, TAILLE_MAX_PX, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      const nouveauNom = `${path.parse(nomFichier).name}.webp`;

      if (APPLIQUER) {
        await prisma.$transaction(async (tx) => {
          await tx.profilePhoto.create({
            data: {
              userId: u.id,
              filename: nouveauNom,
              data,
              mimeType: "image/webp",
              byteSize: data.byteLength,
            },
          });
          await tx.user.update({
            where: { id: u.id },
            data: { profilePhoto: `/uploads/${nouveauNom}` },
          });
        });
      }

      const ko = (n: number) => `${Math.round(n / 1024)} Ko`;
      console.log(`[PHOTOS] ${u.email} : ${ko(brut.byteLength)} -> ${ko(data.byteLength)}`);
      importees++;
    } catch (err) {
      console.error(`[PHOTOS] Echec pour ${u.email} :`, err);
      erreurs++;
    }
  }

  console.log(
    `\n[PHOTOS] ${importees} importee(s), ${deja} deja en base, ` +
      `${externes} URL(s) externe(s) ignoree(s), ` +
      `${introuvables} fichier(s) absent(s), ${erreurs} erreur(s).`
  );
  if (!APPLIQUER && importees > 0) {
    console.log("[PHOTOS] Simulation : rien n'a ete ecrit. Relancer avec --apply.");
  }
}

main()
  .catch((err) => {
    console.error("[PHOTOS] Echec :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
