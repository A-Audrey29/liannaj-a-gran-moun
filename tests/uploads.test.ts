/**
 * Securite et persistance des photos de profil.
 *
 * L'extension d'un fichier ne prouve rien : n'importe qui peut renommer
 * `script.php` en `photo.jpg`. La defense reelle est la lecture des octets
 * de tete (magic bytes) apres reception, via validateAndProcessImage().
 *
 * Couvre : refus d'un fichier deguise, absence de residu sur le disque,
 * authentification et protection contre la traversee de repertoire sur la
 * route de lecture, et le stockage en base — qui garantit que les photos
 * survivent a un redeploiement sur systeme de fichiers ephemere.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import sharp from "sharp";
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
    // Toute photo est reencodee en WebP a l'upload, quel que soit le format
    // d'origine : taille reduite et metadonnees EXIF supprimees.
    expect(res.headers["content-type"]).toBe("image/webp");
    // Empeche un navigateur de reinterpreter le fichier autrement que comme
    // une image, meme si son contenu ressemblait a du HTML.
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    // Photo reservee aux utilisateurs authentifies : aucun cache partage.
    expect(res.headers["cache-control"]).toContain("private");
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

describe("Persistance des photos en base", () => {
  it("la photo survit a la disparition du dossier uploads", async () => {
    const user = await createUser("SENIOR");
    const agent = await loginAs(user);
    const upload = await agent
      .post("/api/auth/me/photo")
      .attach("photo", PNG_VALIDE, { filename: "photo.png", contentType: "image/png" });

    const nomFichier = upload.body.user.profilePhoto.replace("/uploads/", "");

    // Reproduit un redeploiement sur un hebergeur a systeme de fichiers
    // ephemere : tout uploads/ disparait.
    nettoyerUploadsDeTest();

    const res = await agent.get(`/api/photos/${nomFichier}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("les octets sont bien en base et non sur le disque", async () => {
    const user = await createUser("SENIOR");
    const agent = await loginAs(user);
    const avant = new Set(fichiersUploades());

    await agent
      .post("/api/auth/me/photo")
      .attach("photo", PNG_VALIDE, { filename: "photo.png", contentType: "image/png" });

    // multer garde le fichier en memoire : aucun fichier ne doit apparaitre.
    expect(fichiersUploades().filter((f) => !avant.has(f))).toEqual([]);

    const enBase = await prisma.profilePhoto.findUnique({ where: { userId: user.id } });
    expect(enBase).not.toBeNull();
    expect(enBase!.mimeType).toBe("image/webp");
    expect(enBase!.byteSize).toBeGreaterThan(0);
  });

  it("remplacer une photo ne laisse pas l'ancienne en base", async () => {
    const user = await createUser("SENIOR");
    const agent = await loginAs(user);

    const premier = await agent
      .post("/api/auth/me/photo")
      .attach("photo", PNG_VALIDE, { filename: "photo1.png", contentType: "image/png" });
    const second = await agent
      .post("/api/auth/me/photo")
      .attach("photo", PNG_VALIDE, { filename: "photo2.png", contentType: "image/png" });

    expect(premier.body.user.profilePhoto).not.toBe(second.body.user.profilePhoto);

    // Une seule ligne par utilisateur (contrainte unique sur userId).
    expect(await prisma.profilePhoto.count({ where: { userId: user.id } })).toBe(1);

    // L'ancien nom ne resout plus rien.
    const ancienNom = premier.body.user.profilePhoto.replace("/uploads/", "");
    expect((await agent.get(`/api/photos/${ancienNom}`)).status).toBe(404);
  });

  it("supprimer sa photo la retire de la base", async () => {
    const user = await createUser("SENIOR");
    const agent = await loginAs(user);
    await agent
      .post("/api/auth/me/photo")
      .attach("photo", PNG_VALIDE, { filename: "photo.png", contentType: "image/png" });

    const res = await agent.delete("/api/auth/me/photo");

    expect(res.status).toBe(200);
    expect(res.body.user.profilePhoto).toBeNull();
    expect(await prisma.profilePhoto.count({ where: { userId: user.id } })).toBe(0);
  });

  it("supprimer un utilisateur supprime sa photo (cascade)", async () => {
    const admin = await createUser("ADMIN");
    const user = await createUser("SENIOR");
    const agentUser = await loginAs(user);
    await agentUser
      .post("/api/auth/me/photo")
      .attach("photo", PNG_VALIDE, { filename: "photo.png", contentType: "image/png" });

    expect(await prisma.profilePhoto.count({ where: { userId: user.id } })).toBe(1);

    const agentAdmin = await loginAs(admin);
    const res = await agentAdmin.delete(`/api/admin/users/${user.id}`);

    expect(res.status).toBe(200);
    expect(await prisma.profilePhoto.count({ where: { userId: user.id } })).toBe(0);
  });

  it("l'image est redimensionnee et les metadonnees EXIF supprimees", async () => {
    const user = await createUser("SENIOR");
    const agent = await loginAs(user);

    // Grande image (2000x2000) porteuse d'une balise EXIF.
    const grandeImage = await sharp({
      create: {
        width: 2000,
        height: 2000,
        channels: 3,
        background: { r: 120, g: 80, b: 200 },
      },
    })
      .withMetadata({ exif: { IFD0: { Copyright: "POSITION_GPS_SECRETE" } } })
      .jpeg()
      .toBuffer();

    await agent
      .post("/api/auth/me/photo")
      .attach("photo", grandeImage, { filename: "grande.jpg", contentType: "image/jpeg" });

    const enBase = await prisma.profilePhoto.findUnique({ where: { userId: user.id } });
    const metadonnees = await sharp(Buffer.from(enBase!.data)).metadata();

    expect(Math.max(metadonnees.width!, metadonnees.height!)).toBeLessThanOrEqual(800);
    expect(metadonnees.format).toBe("webp");
    // L'EXIF d'origine (qui peut contenir la geolocalisation du domicile)
    // ne doit pas survivre au reencodage.
    expect(Buffer.from(enBase!.data).includes("POSITION_GPS_SECRETE")).toBe(false);
    expect(enBase!.byteSize).toBeLessThan(grandeImage.byteLength);
  });
});
