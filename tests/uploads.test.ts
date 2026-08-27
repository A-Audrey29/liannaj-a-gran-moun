/**
 * Securite de l'upload de photo de profil.
 *
 * L'extension d'un fichier ne prouve rien : n'importe qui peut renommer
 * `script.php` en `photo.jpg`. La defense reelle est la lecture des octets
 * de tete (magic bytes) apres reception, via validateImageMagicBytes().
 *
 * Ces tests verifient qu'un fichier deguise est refuse ET qu'il ne reste pas
 * sur le disque, et que la route de lecture des photos reste authentifiee et
 * protegee contre la traversee de repertoire.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { resetDatabase, createUser, loginAs, anonymousAgent } from "./helpers";
import { prisma } from "../server/prisma";

const DOSSIER_UPLOADS = path.join(process.cwd(), "uploads");

/** PNG 1x1 valide (magic bytes corrects). */
const PNG_VALIDE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/** Fichier texte : aucun magic byte d'image. */
const FAUX_JPEG = Buffer.from("<?php system($_GET['c']); ?>", "utf8");

function fichiersUploades(): string[] {
  if (!fs.existsSync(DOSSIER_UPLOADS)) return [];
  return fs.readdirSync(DOSSIER_UPLOADS).filter((f) => !f.startsWith("."));
}

/**
 * Fichiers presents avant la suite : ils appartiennent au poste de
 * developpement et ne doivent pas etre supprimes par le nettoyage.
 */
const fichiersPreexistants = new Set(fichiersUploades());

/** Supprime uniquement ce que les tests ont ecrit. */
function nettoyerUploadsDeTest() {
  for (const fichier of fichiersUploades()) {
    if (!fichiersPreexistants.has(fichier)) {
      fs.unlinkSync(path.join(DOSSIER_UPLOADS, fichier));
    }
  }
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  nettoyerUploadsDeTest();
  await prisma.$disconnect();
});

describe("POST /api/auth/me/photo — validation du contenu", () => {
  it("accepte une vraie image PNG", async () => {
    const user = await createUser("SENIOR");
    const agent = await loginAs(user);

    const res = await agent
      .post("/api/auth/me/photo")
      .attach("photo", PNG_VALIDE, { filename: "photo.png", contentType: "image/png" });

    expect(res.status).toBe(200);
    expect(res.body.user.profilePhoto).toMatch(/^\/uploads\//);
  });

  it("refuse un fichier non-image renomme en .jpg", async () => {
    const user = await createUser("SENIOR");
    const agent = await loginAs(user);
    const avant = new Set(fichiersUploades());

    const res = await agent
      .post("/api/auth/me/photo")
      .attach("photo", FAUX_JPEG, { filename: "innocent.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(400);

    // Le fichier est ecrit sur disque par multer avant validation : il doit
    // etre supprime au refus, sinon chaque tentative laisse un residu.
    //
    // On compare les ENSEMBLES de noms et non leur nombre : un comptage
    // dependrait de l'etat du dossier partage et rendrait le test instable.
    const nouveaux = fichiersUploades().filter((f) => !avant.has(f));
    expect(nouveaux).toEqual([]);

    const enBase = await prisma.user.findUnique({ where: { id: user.id } });
    expect(enBase?.profilePhoto).toBeNull();
  });

  it("refuse une extension non autorisee", async () => {
    const user = await createUser("SENIOR");
    const agent = await loginAs(user);

    const res = await agent
      .post("/api/auth/me/photo")
      .attach("photo", FAUX_JPEG, { filename: "script.php", contentType: "image/jpeg" });

    expect(res.status).toBe(400);
  });

  it("refuse un upload sans authentification", async () => {
    const agent = await anonymousAgent();

    const res = await agent
      .post("/api/auth/me/photo")
      .attach("photo", PNG_VALIDE, { filename: "photo.png", contentType: "image/png" });

    expect(res.status).toBe(401);
  });
});

describe("GET /api/photos/:filename — acces aux photos", () => {
  it("exige une authentification", async () => {
    const user = await createUser("SENIOR");
    const agent = await loginAs(user);
    const upload = await agent
      .post("/api/auth/me/photo")
      .attach("photo", PNG_VALIDE, { filename: "photo.png", contentType: "image/png" });

    const nomFichier = upload.body.user.profilePhoto.replace("/uploads/", "");

    const anonyme = await anonymousAgent();
    const res = await anonyme.get(`/api/photos/${nomFichier}`);

    expect(res.status).toBe(401);
  });

  it("sert la photo a un utilisateur connecte", async () => {
    const user = await createUser("SENIOR");
    const agent = await loginAs(user);
    const upload = await agent
      .post("/api/auth/me/photo")
      .attach("photo", PNG_VALIDE, { filename: "photo.png", contentType: "image/png" });

    const nomFichier = upload.body.user.profilePhoto.replace("/uploads/", "");
    const res = await agent.get(`/api/photos/${nomFichier}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    // Empeche un navigateur de reinterpreter le fichier autrement que comme
    // une image, meme si son contenu ressemblait a du HTML.
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("rejette une tentative de traversee de repertoire", async () => {
    const user = await createUser("SENIOR");
    const agent = await loginAs(user);

    for (const tentative of ["..%2F..%2F.env", "..%2Fpackage.json", "%2Fetc%2Fpasswd"]) {
      const res = await agent.get(`/api/photos/${tentative}`);
      expect([400, 404]).toContain(res.status);
      expect(res.headers["content-type"]).not.toContain("text/plain");
    }
  });

  it("rejette un nom de fichier qui n'a pas la forme attendue", async () => {
    const user = await createUser("SENIOR");
    const agent = await loginAs(user);

    const res = await agent.get("/api/photos/pas-un-uuid.png");
    expect(res.status).toBe(400);
  });
});
