import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import rateLimit from "express-rate-limit";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { requireAuth, requireAdmin } from "./auth";
import { pool } from "./db";
import { storage } from "./storage";
import { sendEmail } from "./lib/email";
import {
  getValidationEmailHtml,
  getRelationAcceptedEmailHtml,
  getInterventionProposedEmailHtml,
  getInterventionConfirmedEmailHtml,
  getFeedbackReminderEmailHtml,
  getNewReportEmailHtml,
  getCreditPurchaseConfirmedEmailHtml,
  getNegativeCreditBalanceEmailHtml,
} from "./lib/email-templates";
import { insertUserSchema, createRelationSchema, insertInterventionSchema, feedbackSchema, createPaymentSchema, checkoutSchema, changePasswordSchema, createAdminSchema, insertReportSchema, createAvailabilitySchema, createRecurringAvailabilitiesSchema, createDateExceptionSchema, updateUserCategoriesSchema, meetingHistoryQuerySchema, npsSchema, npsQuerySchema, COMPLETED_STATUSES } from "../shared/schema";
import type { MeetingHistoryEntry, MeetingHistoryResponse, MeetingHistorySummary, Role } from "../shared/schema";
import { buildNpsReport, npsCategory } from "../shared/nps";
import type { NpsEligibilityResponse, NpsReport, NpsResponseEntry, NpsSegment } from "../shared/nps";
import type { MeetingHistoryScope, NpsIneligibleReason } from "./storage";
import { createRecurringAvailabilities, createDateException, deleteAvailability, isWithinAvailability, hasInterventionConflict } from "./lib/availability";
import { addSSEClient, sendSSEEvent, isUserConnected } from "./lib/sse";
import { fmtDayNumeric, fmtTime, gpDateTimeToUtc, addDaysISO } from "../shared/dates";
import { PLATFORM_NAME } from "../shared/branding";
import { sendPushNotification, getVapidPublicKey } from "./lib/push";
import { paymentProvider } from "./lib/payment-provider";
import { findCreditOffer } from "../shared/credit-offers";
import { env } from "./env";

const TAILLE_MAX_PHOTO = 5 * 1024 * 1024;

// Les photos sont gardées en mémoire puis écrites en base : le système de
// fichiers de l'hébergeur est éphémère (tout uploads/ disparaît à chaque
// redéploiement). Effet de bord utile : plus de fichier temporaire orphelin
// quand la validation échoue.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAILLE_MAX_PHOTO },
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Format non supporté. Utilisez JPG, PNG ou WebP."));
    }
  },
});

/**
 * `upload.single()` dont les refus deviennent des réponses 400.
 *
 * multer signale un rejet (extension interdite, fichier trop lourd) en passant
 * une Error à next(). Sans cette enveloppe, elle atteint le gestionnaire
 * d'erreur global qui répond 500 : l'utilisateur voit « erreur serveur » alors
 * que son fichier a simplement été refusé, et le message expliquant les
 * formats acceptés est perdu.
 *
 * Enveloppe plutôt que middleware d'erreur séparé : un 4e handler dans la
 * chaîne fait perdre à Express l'inférence de types sur req/res.
 */
function uploadSinglePhoto(champ: string) {
  const middleware = upload.single(champ);

  return (req: Request, res: Response, next: NextFunction) => {
    middleware(req, res, (err: any) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            message: `Fichier trop volumineux (maximum ${TAILLE_MAX_PHOTO / 1024 / 1024} Mo).`,
          });
        }
        return res.status(400).json({ message: "Fichier invalide." });
      }

      // Erreur de notre fileFilter : le message est destiné à l'utilisateur.
      if (err instanceof Error && err.message.startsWith("Format non supporté")) {
        return res.status(400).json({ message: err.message });
      }

      return next(err);
    });
  };
}

function sanitizeUser(user: any) {
  const { password, validationToken, validationExpiry, ...safe } = user;
  return safe;
}

/**
 * Lit un paramètre de route en le garantissant scalaire.
 *
 * Express 5 type req.params en `string | string[]` : une route à joker
 * (`/files/*path`) peut produire un tableau. Aucune route de cette API n'en
 * utilise — les paramètres y sont donc toujours des chaînes — mais le
 * typage ne peut pas le savoir.
 *
 * Plutôt que de forcer le type par un `as string` répété (qui masquerait un
 * vrai tableau si une route à joker était ajoutée un jour), on normalise :
 * un tableau inattendu donne sa première valeur, et l'absence donne "" —
 * ce qui échoue proprement à la validation en aval au lieu de propager
 * `undefined` dans une requête SQL.
 */
function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function sanitizeUserPublic(user: any) {
  const {
    password,
    validationToken,
    validationExpiry,
    phone,
    address,
    postalCode,
    trustedPersonName,
    trustedPersonEmail,
    referentEmail,
    referentTitle,
    referentFirstName,
    referentLastName,
    validatorEmail,
    ...safe
  } = user;
  return safe;
}

function toMeetingHistoryEntry(i: any): MeetingHistoryEntry {
  return {
    id: i.id,
    relationId: i.relationId,
    scheduledDate: i.scheduledDate.toISOString(),
    durationMinutes: i.durationMinutes,
    location: i.location,
    tasks: i.tasks || [],
    status: i.status,
    seniorId: i.relation.seniorId,
    juniorId: i.relation.juniorId,
    seniorName: `${i.relation.senior.firstName} ${i.relation.senior.lastName}`,
    juniorName: `${i.relation.junior.firstName} ${i.relation.junior.lastName}`,
    seniorRating: i.seniorRating,
    seniorComment: i.seniorComment,
    juniorRating: i.juniorRating,
    juniorComment: i.juniorComment,
  };
}

/**
 * Réduit les feedbacks au strict nécessaire selon le rôle du lecteur.
 *
 * - ADMIN / TEACHER : encadrement, les deux feedbacks.
 * - REFERENT_SENIOR : encadre le sénior, voit son feedback, pas celui du jeune.
 * - SENIOR / JUNIOR : uniquement le sien. Ne pas leur renvoyer l'appréciation
 *   que l'autre a portée sur eux.
 *
 * Filtrage serveur et non affichage conditionnel côté client : la donnée
 * masquée ne doit pas partir sur le réseau.
 */
function scopeFeedback(entry: MeetingHistoryEntry, viewerRole: Role, viewerId: string): MeetingHistoryEntry {
  if (viewerRole === "ADMIN" || viewerRole === "TEACHER") return entry;
  if (viewerRole === "REFERENT_SENIOR") {
    return { ...entry, juniorRating: null, juniorComment: null };
  }
  return entry.seniorId === viewerId
    ? { ...entry, juniorRating: null, juniorComment: null }
    : { ...entry, seniorRating: null, seniorComment: null };
}

/**
 * Même règle de visibilité que scopeFeedback, appliquée à une intervention
 * brute (routes /api/relations et /api/relations/:id).
 *
 * Ces routes servent les mêmes feedbacks que l'historique : sans ce filtre, la
 * restriction serait contournable en ouvrant la fiche relation.
 */
function scopeInterventionFeedback<T extends {
  seniorRating: number | null;
  seniorComment: string | null;
  juniorRating: number | null;
  juniorComment: string | null;
}>(intervention: T, viewerRole: Role, viewerId: string, seniorId: string): T {
  if (viewerRole === "ADMIN" || viewerRole === "TEACHER") return intervention;
  if (viewerRole === "REFERENT_SENIOR") {
    return { ...intervention, juniorRating: null, juniorComment: null };
  }
  return seniorId === viewerId
    ? { ...intervention, juniorRating: null, juniorComment: null }
    : { ...intervention, seniorRating: null, seniorComment: null };
}

/**
 * Récap : uniquement les rencontres réellement tenues. Une rencontre annulée ou
 * encore proposée ne représente aucune heure passée.
 *
 * Une rencontre portant plusieurs ateliers compte sa durée entière pour chacun :
 * la somme de byService peut donc dépasser totalMinutes (heures par service, pas
 * une partition).
 */
function buildMeetingSummary(entries: MeetingHistoryEntry[]): MeetingHistorySummary {
  const done = entries.filter((e) => COMPLETED_STATUSES.includes(e.status));
  const byService = new Map<string, { count: number; minutes: number }>();

  for (const entry of done) {
    for (const service of entry.tasks) {
      const acc = byService.get(service) || { count: 0, minutes: 0 };
      acc.count += 1;
      acc.minutes += entry.durationMinutes;
      byService.set(service, acc);
    }
  }

  return {
    totalMeetings: done.length,
    totalMinutes: done.reduce((sum, e) => sum + e.durationMinutes, 0),
    byService: [...byService.entries()]
      .map(([service, v]) => ({ service, ...v }))
      .sort((a, b) => b.minutes - a.minutes),
  };
}

const isDev = process.env.NODE_ENV !== "production";

// Durée de validité du lien de validation d'inscription (7 jours).
const VALIDATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 1000 : 10,
  message: { message: "Trop de tentatives de connexion. Réessayez dans 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: isDev ? 1000 : 5,
  message: { message: "Trop d'inscriptions depuis cette adresse. Réessayez dans une heure." },
  standardHeaders: true,
  legacyHeaders: false,
});

const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: isDev ? 1000 : 10,
  message: { message: "Trop de tentatives d'achat. Réessayez dans 10 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Côté le plus long d'une photo de profil après redimensionnement. */
const PHOTO_TAILLE_MAX_PX = 800;

/**
 * Valide et normalise une photo reçue.
 *
 * L'extension d'un fichier ne prouve rien : la vérification porte sur les
 * octets de tête (magic bytes), pas sur le nom.
 *
 * L'image est ensuite redimensionnée et convertie en WebP. Deux bénéfices :
 * une photo de 5 Mo tombe à ~150 Ko (elle est stockée en base, donc sa taille
 * compte), et le ré-encodage supprime toutes les métadonnées EXIF — dont la
 * géolocalisation, que les téléphones inscrivent par défaut. Sur une
 * plateforme utilisée par des mineurs, publier la position du domicile
 * dans un fichier serait un vrai problème.
 */
async function validateAndProcessImage(
  buffer: Buffer
): Promise<{ data: Buffer; mimeType: string; filename: string }> {
  const type = await fileTypeFromBuffer(buffer);
  const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
  if (!type || !allowedMimes.includes(type.mime)) {
    throw new Error("Fichier invalide : seuls les formats JPG, PNG et WebP sont acceptés.");
  }

  let data: Buffer;
  try {
    data = await sharp(buffer)
      .rotate() // applique l'orientation EXIF avant de la supprimer
      .resize(PHOTO_TAILLE_MAX_PX, PHOTO_TAILLE_MAX_PX, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    // Magic bytes corrects mais contenu illisible : fichier tronqué ou forgé.
    throw new Error("Image illisible ou corrompue.");
  }

  return {
    data,
    mimeType: "image/webp",
    filename: `${crypto.randomUUID()}.webp`,
  };
}

function getBaseUrl(req: any): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5000";
  return `${proto}://${host}`;
}

/**
 * Blocage dur d'un créneau de rencontre. Retourne un message d'erreur FR, ou
 * null si le créneau est valide.
 *
 * Partagé par les trois chemins de création (Senior, Admin pour la 1ère
 * rencontre, Référent au nom du Senior) : un seul d'entre eux non contrôlé
 * suffirait à contourner la contrainte.
 */
async function validateSlot(
  juniorId: string,
  scheduledDate: Date,
  durationMinutes: number,
): Promise<string | null> {
  if (!(await isWithinAvailability(juniorId, scheduledDate, durationMinutes))) {
    return "Ce créneau ne fait pas partie des disponibilités déclarées par le jeune.";
  }
  if (await hasInterventionConflict(juniorId, scheduledDate, durationMinutes)) {
    return "Une autre rencontre est déjà prévue sur ce créneau.";
  }
  return null;
}

const SLOT_CONFLICT_MESSAGE = "Une autre rencontre est déjà prévue sur ce créneau.";
const LOCK_CONTENTION_MESSAGE = "Une autre action est en cours sur ce créneau, veuillez réessayer dans un instant.";
const NO_CREDITS_MESSAGE = "Plus de crédit disponible pour un nouvel atelier : les crédits restants sont déjà réservés pour les ateliers prévus. Achetez un pack pour continuer.";
/**
 * Crée la rencontre via createInterventionSafe (verrou + re-check du conflit
 * dans la transaction), pour fermer la fenêtre de course entre validateSlot()
 * et l'insertion : deux requêtes concurrentes sur le même jeune ne peuvent
 * plus toutes les deux passer la vérification.
 *
 * Vérifie aussi, dans la même transaction et sous verrou par senior, qu'il
 * reste un crédit disponible (solde moins ateliers payants déjà prévus), sauf
 * pour la rencontre gratuite (cf isFreeMeeting dans storage.ts). Seul point de
 * création d'une rencontre.
 */
async function createInterventionOrConflict(
  juniorId: string,
  seniorId: string,
  data: { relationId: string; scheduledDate: Date; durationMinutes: number; location?: string; tasks?: string[] }
) {
  return storage.createInterventionSafe(
    juniorId,
    data,
    (tx) => hasInterventionConflict(juniorId, data.scheduledDate, data.durationMinutes, tx),
    seniorId
  );
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  /**
   * Sonde de santé pour l'hébergeur (Render : Health Check Path).
   * Publique et sans effet de bord : c'est le seul endpoint qui doit répondre
   * 200 sans authentification.
   *
   * Vérifie aussi la base : un serveur qui répond mais dont la base est
   * injoignable est en panne du point de vue de l'utilisateur, et doit être
   * signalé comme tel plutôt que de recevoir du trafic.
   */
  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.status(200).json({ status: "ok", database: "up" });
    } catch (err) {
      console.error("[HEALTH] Base de données injoignable:", err);
      res.status(503).json({ status: "error", database: "down" });
    }
  });

  app.post("/api/auth/register", registerLimiter, uploadSinglePhoto("photo"), async (req, res) => {
    try {
      const body = typeof req.body.data === "string" ? JSON.parse(req.body.data) : req.body;
      const parsed = insertUserSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Données invalides",
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const data = parsed.data;

      const existing = await storage.getUserByEmail(data.email.toLowerCase().trim());
      if (existing) {
        return res.status(409).json({ message: "Cet email est déjà utilisé" });
      }

      let photo: { data: Buffer; mimeType: string; filename: string } | null = null;
      if (req.file) {
        try {
          photo = await validateAndProcessImage(req.file.buffer);
        } catch (validationErr: any) {
          return res.status(400).json({ message: validationErr.message });
        }
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);
      const validationToken = crypto.randomUUID();
      const validationExpiry = new Date(Date.now() + VALIDATION_TOKEN_TTL_MS);

      const { categoryIds, birthDate, ...userData } = data;

      const user = await storage.createUser({
        ...userData,
        email: userData.email.toLowerCase().trim(),
        password: hashedPassword,
        birthDate: birthDate ? new Date(birthDate) : null,
        status: "PENDING_VALIDATION",
        role: userData.role,
        validationToken,
        validationExpiry,
      });

      if (photo) {
        await storage.replaceProfilePhoto(user.id, photo);
      }

      if (categoryIds && categoryIds.length > 0) {
        for (const categoryId of categoryIds) {
          await storage.createUserCategory(user.id, categoryId);
        }
      }

      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
      const validationUrl = `${baseUrl}/api/validate?token=${validationToken}`;
      const userName = `${user.firstName} ${user.lastName}`;

      if (process.env.NODE_ENV !== "production") {
        console.log(`[DEV] Lien de validation pour ${data.email} : ${validationUrl}`);
      }

      await sendEmail({
        to: data.validatorEmail,
        subject: `${PLATFORM_NAME} - Validation d'inscription de ${userName}`,
        htmlContent: getValidationEmailHtml(null, userName, validationUrl),
      });

      return res.status(201).json({
        message: "Inscription réussie ! Un email a été envoyé à votre référent pour valider votre compte.",
      });
    } catch (err) {
      console.error("[REGISTER] Error:", err);
      return res.status(500).json({ message: "Erreur lors de l'inscription" });
    }
  });

  app.post("/api/auth/login", loginLimiter, (req, res, next) => {
    passport.authenticate("local", async (err: any, user: Express.User | false, info: { message: string }) => {
      if (err) {
        return res.status(500).json({ message: "Erreur interne" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Identifiants incorrects" });
      }
      try {
        await new Promise<void>((resolve, reject) =>
          req.session.regenerate((sessionErr) => (sessionErr ? reject(sessionErr) : resolve()))
        );
      } catch {
        return res.status(500).json({ message: "Erreur de session" });
      }
      req.logIn(user, async (loginErr) => {
        if (loginErr) {
          return res.status(500).json({ message: "Erreur de session" });
        }
        let hasPendingFeedback = false;
        try {
          const pending = await storage.getPendingFeedbackInterventions(user.id);
          hasPendingFeedback = pending.some((intervention) => {
            const isSenior = intervention.relation.seniorId === user.id;
            if (isSenior && intervention.seniorRating !== null) return false;
            if (!isSenior && intervention.juniorRating !== null) return false;
            return true;
          });
        } catch (_e) {}
        return res.json({ user, hasPendingFeedback });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Erreur lors de la déconnexion" });
      }
      res.json({ message: "Déconnecté" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Non authentifié" });
    }
    res.json({ user: req.user });
  });

  app.patch("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const { updateProfileSchema } = await import("@shared/schema");
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
      }
      const updated = await storage.updateUser(req.user!.id, parsed.data);
      const { password, validationToken, validationExpiry, ...safeUser } = updated as any;
      req.login(safeUser, (err) => {
        if (err) return res.status(500).json({ message: "Erreur session" });
        res.json({ user: safeUser });
      });
    } catch (err) {
      res.status(500).json({ message: "Erreur lors de la mise à jour du profil" });
    }
  });

  app.patch("/api/auth/me/password", requireAuth, async (req, res) => {
    try {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
      }
      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });

      const valid = await bcrypt.compare(parsed.data.currentPassword, user.password);
      if (!valid) {
        return res.status(400).json({ message: "Mot de passe actuel incorrect" });
      }

      const hashed = await bcrypt.hash(parsed.data.newPassword, 10);
      await storage.updateUser(user.id, { password: hashed });
      res.json({ message: "Mot de passe modifié" });
    } catch (err) {
      console.error("[CHANGE_PASSWORD] Error:", err);
      res.status(500).json({ message: "Erreur lors du changement de mot de passe" });
    }
  });

  app.get("/api/auth/me/categories", requireAuth, async (req, res) => {
    try {
      const userCategories = await storage.getUserCategories(req.user!.id);
      res.json({ categoryIds: userCategories.map((uc) => uc.categoryId) });
    } catch (err) {
      res.status(500).json({ message: "Erreur lors de la récupération des ateliers" });
    }
  });

  app.patch("/api/auth/me/categories", requireAuth, async (req, res) => {
    try {
      const parsed = updateUserCategoriesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
      }
      await storage.deleteUserCategories(req.user!.id);
      for (const categoryId of parsed.data.categoryIds) {
        await storage.createUserCategory(req.user!.id, categoryId);
      }
      res.json({ categoryIds: parsed.data.categoryIds });
    } catch (err) {
      res.status(500).json({ message: "Erreur lors de la mise à jour des ateliers" });
    }
  });

  app.post("/api/auth/me/photo", requireAuth, uploadSinglePhoto("photo"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Aucun fichier envoyé" });
      }
      let photo: { data: Buffer; mimeType: string; filename: string };
      try {
        photo = await validateAndProcessImage(req.file.buffer);
      } catch (validationErr: any) {
        return res.status(400).json({ message: validationErr.message });
      }
      const user = req.user!;
      // L'upsert de replaceProfilePhoto remplace l'ancienne photo : rien à
      // supprimer sur disque, et pas de résidu possible.
      const updated = await storage.replaceProfilePhoto(user.id, photo);
      const safeUser = sanitizeUser(updated);
      req.login(safeUser, (err) => {
        if (err) return res.status(500).json({ message: "Erreur session" });
        res.json({ user: safeUser });
      });
    } catch (err) {
      console.error("[PHOTO_UPLOAD] Error:", err);
      res.status(500).json({ message: "Erreur lors de l'upload de la photo" });
    }
  });

  app.delete("/api/auth/me/photo", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const updated = await storage.deleteProfilePhoto(user.id);
      const safeUser = sanitizeUser(updated);
      req.login(safeUser, (err) => {
        if (err) return res.status(500).json({ message: "Erreur session" });
        res.json({ user: safeUser });
      });
    } catch (err) {
      console.error("[PHOTO_DELETE] Error:", err);
      res.status(500).json({ message: "Erreur lors de la suppression de la photo" });
    }
  });

  const VALID_PHOTO_FILENAME = /^[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$/i;
  const PHOTO_CONTENT_TYPES: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };

  app.get("/api/photos/:filename", requireAuth, async (req, res) => {
    try {
      const filename = getParam(req, "filename");
      // Le nom doit être exactement un UUID suivi d'une extension connue :
      // c'est ce qui rend impossible toute traversée de répertoire pour les
      // photos encore servies depuis le disque.
      if (!VALID_PHOTO_FILENAME.test(filename)) {
        return res.status(400).json({ message: "Nom de fichier invalide" });
      }

      const enTetesImage = (contentType: string) => {
        res.setHeader("Content-Type", contentType);
        // Empêche un navigateur de réinterpréter le contenu autrement que
        // comme une image.
        res.setHeader("X-Content-Type-Options", "nosniff");
        // `private` : la photo est réservée aux utilisateurs authentifiés,
        // aucun cache partagé ne doit la conserver.
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.setHeader("Content-Disposition", "inline");
      };

      const photo = await storage.getProfilePhotoByFilename(filename);
      if (photo) {
        enTetesImage(photo.mimeType);
        return res.send(photo.data);
      }

      // Photos d'avant la bascule en base : encore sur le disque tant que le
      // script de migration n'a pas tourné. À retirer une fois la migration
      // faite sur tous les environnements.
      const filePath = path.join(process.cwd(), "uploads", filename);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filename).toLowerCase().slice(1);
        enTetesImage(PHOTO_CONTENT_TYPES[ext] || "application/octet-stream");
        return res.sendFile(filePath);
      }

      return res.status(404).json({ message: "Photo non trouvée" });
    } catch (err) {
      console.error("[PHOTO_SERVE] Error:", err);
      return res.status(500).json({ message: "Erreur lors du chargement de la photo" });
    }
  });

  app.get("/api/favorites", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      if (user.role !== "SENIOR") {
        return res.status(403).json({ message: "Réservé aux seniors" });
      }
      const juniorIds = await storage.getFavoriteJuniorIds(user.id);
      res.json(juniorIds);
    } catch (err) {
      console.error("[FAVORITES] Error:", err);
      res.status(500).json({ message: "Erreur lors du chargement des favoris" });
    }
  });

  app.post("/api/favorites/:juniorId", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      if (user.role !== "SENIOR") {
        return res.status(403).json({ message: "Réservé aux seniors" });
      }
      const junior = await storage.getUser(getParam(req, "juniorId"));
      if (!junior || junior.role !== "JUNIOR") {
        return res.status(404).json({ message: "Jeune non trouvé" });
      }
      const favorite = await storage.addFavorite(user.id, getParam(req, "juniorId"));
      res.status(201).json(favorite);
    } catch (err) {
      console.error("[FAVORITE_ADD] Error:", err);
      res.status(500).json({ message: "Erreur lors de l'ajout du favori" });
    }
  });

  app.delete("/api/favorites/:juniorId", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      if (user.role !== "SENIOR") {
        return res.status(403).json({ message: "Réservé aux seniors" });
      }
      await storage.removeFavorite(user.id, getParam(req, "juniorId"));
      res.json({ message: "Favori supprimé" });
    } catch (err) {
      console.error("[FAVORITE_REMOVE] Error:", err);
      res.status(500).json({ message: "Erreur lors de la suppression du favori" });
    }
  });

  app.get("/api/categories", async (_req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (err) {
      res.status(500).json({ message: "Erreur lors du chargement des catégories" });
    }
  });

  app.get("/api/notifications/count", requireAuth, async (req, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.user!.id);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const notifications = await storage.getNotifications(req.user!.id);
      res.json(notifications);
    } catch (err) {
      res.status(500).json({ message: "Erreur" });
    }
  });

  // GET = simple redirection vers la page de confirmation côté client, SANS
  // effet de bord. Indispensable : les scanners antivirus / proxys de messagerie
  // préchargent les liens des emails ; si ce GET validait le compte, le token
  // serait consommé avant que le référent ne clique → inscription cassée.
  // La validation réelle se fait via POST /api/validate (action humaine).
  app.get("/api/validate", (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token) {
      return res.redirect("/validation-error?reason=invalid");
    }
    return res.redirect(`/validate?token=${encodeURIComponent(token)}`);
  });

  app.post("/api/validate", async (req, res) => {
    try {
      const token = typeof req.body.token === "string" ? req.body.token : "";
      if (!token) {
        return res.status(400).json({ message: "Token manquant", reason: "invalid" });
      }

      const user = await storage.getUserByValidationToken(token);
      if (!user) {
        return res.status(404).json({ message: "Lien invalide ou déjà utilisé", reason: "invalid" });
      }

      // Déjà validé (token consommé mais utilisateur actif) : idempotent.
      if (user.status === "ACTIVE") {
        return res.json({ message: "Compte déjà validé" });
      }

      if (user.validationExpiry && user.validationExpiry.getTime() < Date.now()) {
        return res.status(410).json({ message: "Lien expiré", reason: "expired" });
      }

      await storage.updateUser(user.id, {
        status: "ACTIVE",
        validationToken: null,
        validationExpiry: null,
      });

      return res.json({ message: "Compte validé" });
    } catch (err) {
      console.error("[VALIDATE] Error:", err);
      return res.status(500).json({ message: "Erreur lors de la validation", reason: "invalid" });
    }
  });

  app.patch("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      await storage.markAllNotificationsRead(req.user!.id);
      res.json({ message: "Toutes les notifications ont été marquées comme lues" });
    } catch (err) {
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const notifications = await storage.getNotifications(req.user!.id);
      const owns = notifications.some((n) => n.id === getParam(req, "id"));
      if (!owns) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      const notification = await storage.markNotificationRead(getParam(req, "id"));
      res.json(notification);
    } catch (err) {
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.post("/api/auth/resend-validation", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(200).json({ message: "Si un compte en attente existe avec cet email, un nouveau lien de validation a été envoyé." });
      }

      const user = await storage.getUserByEmail(email.trim().toLowerCase());

      if (user && user.status === "PENDING_VALIDATION" && user.validatorEmail) {
        const newToken = crypto.randomUUID();

        await storage.updateUser(user.id, {
          validationToken: newToken,
          validationExpiry: new Date(Date.now() + VALIDATION_TOKEN_TTL_MS),
        });

        const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
        const validationUrl = `${baseUrl}/api/validate?token=${newToken}`;

        if (process.env.NODE_ENV !== "production") {
          console.log(`[DEV] Lien de validation renvoyé pour ${user.email} : ${validationUrl}`);
        }

        const userName = `${user.firstName} ${user.lastName}`;
        await sendEmail({
          to: user.validatorEmail,
          subject: `${PLATFORM_NAME} - Nouvelle demande de validation d'inscription de ${userName}`,
          htmlContent: getValidationEmailHtml(null, userName, validationUrl),
        });
      }

      return res.status(200).json({ message: "Si un compte en attente existe avec cet email, un nouveau lien de validation a été envoyé." });
    } catch (err) {
      console.error("[resend-validation] Erreur:", err);
      return res.status(200).json({ message: "Si un compte en attente existe avec cet email, un nouveau lien de validation a été envoyé." });
    }
  });

  // ==================== MATCHING ====================

  app.get("/api/matching/suggestions", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      if (user.role === "ADMIN") {
        return res.status(400).json({ message: "Les administrateurs n'ont pas de suggestions de matching" });
      }
      const suggestions = await storage.getMatchingSuggestions(user.id);
      const favoriteIds = user.role === "SENIOR"
        ? new Set(await storage.getFavoriteJuniorIds(user.id))
        : new Set<string>();
      const sanitized = suggestions.map((s) => ({
        user: sanitizeUserPublic(s.user),
        commonCategories: s.commonCategories,
        isRecommended: s.isRecommended,
        isFavorite: favoriteIds.has(s.user.id),
      }));
      res.json(sanitized);
    } catch (err) {
      console.error("[MATCHING] Error:", err);
      res.status(500).json({ message: "Erreur lors du chargement des suggestions" });
    }
  });

  // ==================== RELATIONS ====================

  app.get("/api/relations", requireAuth, async (req, res) => {
    try {
      const relations = await storage.getRelationsByUser(req.user!.id);
      const sanitized = relations.map((r) => ({
        ...r,
        senior: sanitizeUserPublic(r.senior),
        junior: sanitizeUserPublic(r.junior),
        interventions: (r.interventions || []).map((i) =>
          scopeInterventionFeedback(i, req.user!.role as Role, req.user!.id, r.seniorId)
        ),
      }));
      res.json(sanitized);
    } catch (err) {
      console.error("[RELATIONS] Error:", err);
      res.status(500).json({ message: "Erreur lors du chargement des relations" });
    }
  });

  app.get("/api/relations/:id", requireAuth, async (req, res) => {
    try {
      const relation = await storage.getRelationWithUsers(getParam(req, "id"));
      if (!relation) {
        return res.status(404).json({ message: "Relation non trouvée" });
      }
      const userId = req.user!.id;
      const linkedSeniorId = req.user!.role === "REFERENT_SENIOR" ? (req.user as any).linkedSeniorId : null;
      const isReferentOfSenior = linkedSeniorId !== null && relation.seniorId === linkedSeniorId;
      if (relation.seniorId !== userId && relation.juniorId !== userId && !isReferentOfSenior && req.user!.role !== "ADMIN") {
        return res.status(403).json({ message: "Accès refusé" });
      }
      res.json({
        ...relation,
        senior: sanitizeUserPublic(relation.senior),
        junior: sanitizeUserPublic(relation.junior),
        interventions: (relation.interventions || []).map((i) =>
          scopeInterventionFeedback(i, req.user!.role as Role, userId, relation.seniorId)
        ),
      });
    } catch (err) {
      console.error("[RELATION_DETAIL] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.post("/api/relations", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      if (user.role !== "SENIOR") {
        return res.status(403).json({ message: "Seuls les Seniors peuvent initier une demande de relation" });
      }

      const parsed = createRelationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Données invalides",
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const { juniorId } = parsed.data;

      const junior = await storage.getUser(juniorId);
      if (!junior || junior.role !== "JUNIOR" || junior.status !== "ACTIVE") {
        return res.status(400).json({ message: "Junior introuvable ou inactif" });
      }

      const existing = await storage.getRelationBySeniorAndJunior(user.id, juniorId);
      if (existing) {
        return res.status(409).json({ message: "Une relation existe déjà avec ce Junior" });
      }

      const relation = await storage.createRelation(user.id, juniorId);

      await storage.createNotification({
        user: { connect: { id: juniorId } },
        type: "RELATION_REQUEST",
        title: "Nouvelle demande de relation",
        message: `${user.firstName} ${user.lastName} souhaite démarrer une relation avec vous.`,
        link: `/relations/${relation.id}`,
      });

      res.status(201).json(relation);
    } catch (err) {
      console.error("[CREATE_RELATION] Error:", err);
      res.status(500).json({ message: "Erreur lors de la création de la relation" });
    }
  });

  app.patch("/api/relations/:id/accept", requireAuth, async (req, res) => {
    try {
      const relation = await storage.getRelation(getParam(req, "id"));
      if (!relation) {
        return res.status(404).json({ message: "Relation non trouvée" });
      }
      if (relation.juniorId !== req.user!.id) {
        return res.status(403).json({ message: "Seul le Junior peut accepter la demande" });
      }
      if (relation.status !== "PENDING") {
        return res.status(400).json({ message: "Cette demande ne peut plus être acceptée" });
      }

      const updated = await storage.updateRelationStatus(relation.id, "PENDING_FIRST_MEETING");

      await storage.createNotification({
        user: { connect: { id: relation.seniorId } },
        type: "RELATION_REQUEST",
        title: "Demande acceptée",
        message: `${req.user!.firstName} ${req.user!.lastName} a accepté votre demande de relation. Un administrateur va organiser la première rencontre.`,
        link: `/relations/${relation.id}`,
      });

      const senior = await storage.getUser(relation.seniorId);
      if (senior?.email) {
        const seniorName = `${senior.firstName} ${senior.lastName}`;
        const juniorName = `${req.user!.firstName} ${req.user!.lastName}`;
        sendEmail({
          to: senior.email,
          subject: `${PLATFORM_NAME} - Votre demande de relation a été acceptée`,
          htmlContent: getRelationAcceptedEmailHtml(seniorName, juniorName, `${getBaseUrl(req)}/relations/${relation.id}`),
        }).catch(console.error);
      }

      res.json(updated);
    } catch (err) {
      console.error("[ACCEPT_RELATION] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.patch("/api/relations/:id/reject", requireAuth, async (req, res) => {
    try {
      const relation = await storage.getRelation(getParam(req, "id"));
      if (!relation) {
        return res.status(404).json({ message: "Relation non trouvée" });
      }
      if (relation.juniorId !== req.user!.id) {
        return res.status(403).json({ message: "Seul le Junior peut refuser la demande" });
      }
      if (relation.status !== "PENDING") {
        return res.status(400).json({ message: "Cette demande ne peut plus être refusée" });
      }

      const updated = await storage.updateRelationStatus(relation.id, "CLOSED");

      await storage.createNotification({
        user: { connect: { id: relation.seniorId } },
        type: "RELATION_REQUEST",
        title: "Demande refusée",
        message: `${req.user!.firstName} ${req.user!.lastName} a décliné votre demande de relation.`,
        link: `/relations/${relation.id}`,
      });

      res.json(updated);
    } catch (err) {
      console.error("[REJECT_RELATION] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.patch("/api/relations/:id/close", requireAuth, async (req, res) => {
    try {
      const relation = await storage.getRelation(getParam(req, "id"));
      if (!relation) {
        return res.status(404).json({ message: "Relation non trouvée" });
      }
      const userId = req.user!.id;
      if (relation.seniorId !== userId && relation.juniorId !== userId && req.user!.role !== "ADMIN") {
        return res.status(403).json({ message: "Accès refusé" });
      }
      if (relation.status === "CLOSED") {
        return res.status(400).json({ message: "Cette relation est déjà fermée" });
      }

      const updated = await storage.updateRelationStatus(relation.id, "CLOSED");

      const otherId = relation.seniorId === userId ? relation.juniorId : relation.seniorId;
      await storage.createNotification({
        user: { connect: { id: otherId } },
        type: "SYSTEM",
        title: "Relation fermée",
        message: `${req.user!.firstName} ${req.user!.lastName} a mis fin à la relation.`,
        link: `/relations/${relation.id}`,
      });

      res.json(updated);
    } catch (err) {
      console.error("[CLOSE_RELATION] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  // ==================== INTERVENTIONS ====================

  app.post("/api/relations/:relationId/interventions", requireAuth, async (req, res) => {
    try {
      const relation = await storage.getRelationWithUsers(getParam(req, "relationId"));
      if (!relation) {
        return res.status(404).json({ message: "Relation non trouvée" });
      }

      const user = req.user!;
      if (relation.status === "PENDING_FIRST_MEETING") {
        if (user.role !== "ADMIN") {
          return res.status(403).json({ message: "Seul un administrateur peut organiser la première rencontre" });
        }
      } else if (relation.status === "ACTIVE") {
        if (relation.seniorId !== user.id && user.role !== "ADMIN") {
          return res.status(403).json({ message: "Seul le Senior peut proposer une intervention" });
        }
      } else {
        return res.status(400).json({ message: "La relation n'est pas dans un état permettant de créer une intervention" });
      }

      const parsed = insertInterventionSchema.safeParse({
        ...req.body,
        relationId: getParam(req, "relationId"),
      });
      if (!parsed.success) {
        return res.status(400).json({
          message: "Données invalides",
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const scheduledDate = new Date(parsed.data.scheduledDate);
      if (Number.isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ message: "Date invalide" });
      }

      const slotError = await validateSlot(relation.juniorId, scheduledDate, parsed.data.durationMinutes);
      if (slotError) {
        return res.status(400).json({ message: slotError });
      }

      const result = await createInterventionOrConflict(relation.juniorId, relation.seniorId, {
        relationId: parsed.data.relationId,
        scheduledDate,
        durationMinutes: parsed.data.durationMinutes,
        location: parsed.data.location,
        tasks: parsed.data.tasks,
      });
      if ("noCredits" in result) {
        return res.status(402).json({ message: NO_CREDITS_MESSAGE, code: "INSUFFICIENT_CREDITS" });
      }
      if ("conflict" in result) {
        return res.status(400).json({ message: SLOT_CONFLICT_MESSAGE });
      }
      if ("locked" in result) {
        return res.status(409).json({ message: LOCK_CONTENTION_MESSAGE });
      }
      const intervention = result.intervention;

      await storage.createNotification({
        user: { connect: { id: relation.juniorId } },
        type: "INTERVENTION_PROPOSED",
        title: "Nouvelle intervention proposée",
        message: `Une intervention a été proposée pour le ${fmtDayNumeric(new Date(parsed.data.scheduledDate))} à ${fmtTime(new Date(parsed.data.scheduledDate))}.`,
        link: `/relations/${relation.id}`,
      });

      const junior = await storage.getUser(relation.juniorId);
      if (junior?.email) {
        const juniorName = `${junior.firstName} ${junior.lastName}`;
        const dateStr = `${fmtDayNumeric(new Date(parsed.data.scheduledDate))} à ${fmtTime(new Date(parsed.data.scheduledDate))}`;
        const locationStr = parsed.data.location || "Non précisé";
        sendEmail({
          to: junior.email,
          subject: `${PLATFORM_NAME} - Nouvelle intervention proposée pour le ${dateStr}`,
          htmlContent: getInterventionProposedEmailHtml(juniorName, dateStr, locationStr, `${getBaseUrl(req)}/relations/${relation.id}`),
        }).catch(console.error);
      }

      res.status(201).json(intervention);
    } catch (err) {
      console.error("[CREATE_INTERVENTION] Error:", err);
      res.status(500).json({ message: "Erreur lors de la création de l'intervention" });
    }
  });

  app.patch("/api/interventions/:id/confirm", requireAuth, async (req, res) => {
    try {
      const intervention = await storage.getInterventionWithRelation(getParam(req, "id"));
      if (!intervention) {
        return res.status(404).json({ message: "Intervention non trouvée" });
      }
      if (intervention.relation.juniorId !== req.user!.id) {
        return res.status(403).json({ message: "Seul le Junior peut confirmer l'intervention" });
      }
      if (intervention.status !== "PROPOSED") {
        return res.status(400).json({ message: "Cette intervention ne peut plus être confirmée" });
      }

      const updated = await storage.updateIntervention(intervention.id, { status: "CONFIRMED" });

      await storage.createNotification({
        user: { connect: { id: intervention.relation.seniorId } },
        type: "INTERVENTION_CONFIRMED",
        title: "Intervention confirmée",
        message: `${req.user!.firstName} ${req.user!.lastName} a confirmé l'intervention du ${fmtDayNumeric(intervention.scheduledDate)} à ${fmtTime(intervention.scheduledDate)}.`,
        link: `/relations/${intervention.relationId}`,
      });

      const senior = await storage.getUser(intervention.relation.seniorId);
      if (senior?.email) {
        const seniorName = `${senior.firstName} ${senior.lastName}`;
        const dateStr = fmtDayNumeric(intervention.scheduledDate);
        sendEmail({
          to: senior.email,
          subject: `${PLATFORM_NAME} - Intervention confirmée pour le ${dateStr}`,
          htmlContent: getInterventionConfirmedEmailHtml(seniorName, dateStr, `${getBaseUrl(req)}/relations/${intervention.relationId}`),
        }).catch(console.error);
      }

      res.json(updated);
    } catch (err) {
      console.error("[CONFIRM_INTERVENTION] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.patch("/api/interventions/:id/done", requireAdmin, async (req, res) => {
    try {
      const intervention = await storage.getInterventionWithRelation(getParam(req, "id"));
      if (!intervention) {
        return res.status(404).json({ message: "Intervention non trouvée" });
      }
      if (intervention.status !== "CONFIRMED") {
        return res.status(400).json({ message: "L'intervention doit être confirmée avant d'être marquée comme réalisée" });
      }

      const completion = await storage.completeIntervention(
        intervention.id,
        intervention.relation.seniorId,
        req.user!.id
      );
      if (!completion) {
        return res.status(409).json({ message: "Cette rencontre a déjà été traitée" });
      }
      const updated = completion.intervention;

      if (intervention.relation.status === "PENDING_FIRST_MEETING") {
        await storage.updateRelationStatus(intervention.relationId, "ACTIVE");
        await storage.getOrCreateConversation(intervention.relationId);
      }

      const seniorId = intervention.relation.seniorId;
      const juniorId = intervention.relation.juniorId;

      // Cas rare : plusieurs interventions CONFIRMED simultanées sur un solde
      // insuffisant peuvent faire passer le solde en négatif à la validation.
      // On ne bloque jamais la complétion elle-même (l'intervention n'a plus
      // de porte de sortie une fois COMPLETED_PENDING_FEEDBACK, CANCELLED
      // n'étant plus possible) — on se contente d'avertir le sénior et son
      // référent, le blocage réel se fait déjà à la création de toute
      // nouvelle intervention (solde <= 0 → 402).
      const balanceAfter = await storage.getCreditBalance(seniorId);
      if (balanceAfter < 0) {
        const seniorForAlert = await storage.getUser(seniorId);
        const referents = await storage.getReferentsBySeniorId(seniorId);
        const alertRecipients = [seniorForAlert, ...referents].filter(
          (u): u is NonNullable<typeof u> => !!u
        );
        for (const recipient of alertRecipients) {
          await storage.createNotification({
            user: { connect: { id: recipient.id } },
            type: "SYSTEM",
            title: "Solde de crédits négatif",
            message: `Le solde de crédits est de ${balanceAfter}. Un rattrapage est nécessaire pour organiser de nouvelles rencontres.`,
            link: `/relations/${intervention.relationId}`,
          });
          if (recipient.email && seniorForAlert) {
            sendEmail({
              to: recipient.email,
              subject: `Solde de crédits négatif — ${PLATFORM_NAME}`,
              htmlContent: getNegativeCreditBalanceEmailHtml(
                `${recipient.firstName} ${recipient.lastName}`,
                `${seniorForAlert.firstName} ${seniorForAlert.lastName}`,
                balanceAfter
              ),
            }).catch(console.error);
          }
        }
      }

      await storage.createNotification({
        user: { connect: { id: seniorId } },
        type: "FEEDBACK_REMINDER",
        title: "Feedback requis",
        message: "L'intervention a été validée. Merci de laisser votre feedback.",
        link: `/relations/${intervention.relationId}`,
      });

      await storage.createNotification({
        user: { connect: { id: juniorId } },
        type: "FEEDBACK_REMINDER",
        title: "Feedback requis",
        message: "L'intervention a été validée. Merci de laisser votre feedback.",
        link: `/relations/${intervention.relationId}`,
      });

      const dateStr = fmtDayNumeric(intervention.scheduledDate);
      const seniorUser = await storage.getUser(seniorId);
      if (seniorUser?.email) {
        sendEmail({
          to: seniorUser.email,
          subject: `${PLATFORM_NAME} - Donnez votre avis sur l'intervention du ${dateStr}`,
          htmlContent: getFeedbackReminderEmailHtml(`${seniorUser.firstName} ${seniorUser.lastName}`, dateStr, `${getBaseUrl(req)}/relations/${intervention.relationId}`),
        }).catch(console.error);
      }
      const juniorUser = await storage.getUser(juniorId);
      if (juniorUser?.email) {
        sendEmail({
          to: juniorUser.email,
          subject: `${PLATFORM_NAME} - Donnez votre avis sur l'intervention du ${dateStr}`,
          htmlContent: getFeedbackReminderEmailHtml(`${juniorUser.firstName} ${juniorUser.lastName}`, dateStr, `${getBaseUrl(req)}/relations/${intervention.relationId}`),
        }).catch(console.error);
      }

      res.json(updated);
    } catch (err) {
      console.error("[DONE_INTERVENTION] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.patch("/api/interventions/:id/cancel", requireAuth, async (req, res) => {
    try {
      const intervention = await storage.getInterventionWithRelation(getParam(req, "id"));
      if (!intervention) {
        return res.status(404).json({ message: "Intervention non trouvée" });
      }

      const user = req.user!;
      if (intervention.relation.seniorId !== user.id && user.role !== "ADMIN") {
        return res.status(403).json({ message: "Seul le Senior ou un administrateur peut annuler l'intervention" });
      }
      if (intervention.status === "CANCELLED" || intervention.status === "COMPLETED" || intervention.status === "COMPLETED_PENDING_FEEDBACK") {
        return res.status(400).json({ message: "Cette intervention ne peut plus être annulée" });
      }

      const updated = await storage.updateIntervention(intervention.id, { status: "CANCELLED" });

      const otherId = intervention.relation.seniorId === user.id
        ? intervention.relation.juniorId
        : intervention.relation.seniorId;

      await storage.createNotification({
        user: { connect: { id: otherId } },
        type: "SYSTEM",
        title: "Intervention annulée",
        message: `L'intervention du ${fmtDayNumeric(intervention.scheduledDate)} a été annulée.`,
        link: `/relations/${intervention.relationId}`,
      });

      res.json(updated);
    } catch (err) {
      console.error("[CANCEL_INTERVENTION] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  // ==================== AVAILABILITIES ====================

  app.get("/api/availabilities/me", requireAuth, async (req, res) => {
    try {
      const availabilities = await storage.getAvailabilitiesByUser(req.user!.id);
      res.json(availabilities);
    } catch (err) {
      console.error("[GET_MY_AVAILABILITIES] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.post("/api/availabilities", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "JUNIOR") {
        return res.status(403).json({ message: "Seul un Junior peut déclarer une disponibilité" });
      }
      const parsed = createAvailabilitySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten().fieldErrors });
      }
      const availability = await storage.createAvailability({
        userId: req.user!.id,
        startAt: new Date(parsed.data.startAt),
        endAt: new Date(parsed.data.endAt),
        kind: parsed.data.kind,
      });
      res.status(201).json(availability);
    } catch (err) {
      console.error("[CREATE_AVAILABILITY] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.post("/api/availabilities/recurring", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "JUNIOR") {
        return res.status(403).json({ message: "Seul un Junior peut déclarer un planning récurrent" });
      }
      const parsed = createRecurringAvailabilitiesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten().fieldErrors });
      }
      const result = await createRecurringAvailabilities(req.user!.id, parsed.data);
      res.status(201).json(result);
    } catch (err) {
      console.error("[CREATE_RECURRING_AVAILABILITIES] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.post("/api/availabilities/exception", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "JUNIOR") {
        return res.status(403).json({ message: "Seul un Junior peut déclarer une exception" });
      }
      const parsed = createDateExceptionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten().fieldErrors });
      }
      const result = await createDateException(req.user!.id, parsed.data);
      res.status(201).json(result);
    } catch (err) {
      console.error("[CREATE_DATE_EXCEPTION] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.delete("/api/availabilities/:id", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "JUNIOR") {
        return res.status(403).json({ message: "Seul un Junior peut supprimer une disponibilité" });
      }
      const ok = await deleteAvailability(req.user!.id, getParam(req, "id"));
      if (!ok) {
        return res.status(404).json({ message: "Disponibilité introuvable" });
      }
      res.status(204).end();
    } catch (err) {
      console.error("[DELETE_AVAILABILITY] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.get("/api/users/:juniorId/availabilities", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const juniorId = getParam(req, "juniorId");
      if (user.role !== "ADMIN") {
        // Le référent consulte au nom du sénior auquel il est rattaché : il
        // propose des rencontres, il lui faut donc les mêmes créneaux.
        const seniorId =
          user.role === "REFERENT_SENIOR" ? (user as any).linkedSeniorId : user.id;
        if ((user.role !== "SENIOR" && user.role !== "REFERENT_SENIOR") || !seniorId) {
          return res.status(403).json({ message: "Accès refusé" });
        }
        const relation = await storage.getRelationBySeniorAndJunior(seniorId, juniorId);
        // PENDING_FIRST_MEETING compte : c'est justement la phase où la 1ère
        // rencontre se cale, donc celle où les dispos servent le plus.
        if (!relation || (relation.status !== "ACTIVE" && relation.status !== "PENDING_FIRST_MEETING")) {
          return res.status(403).json({ message: "Aucune relation active avec ce Junior" });
        }
      }
      const availabilities = await storage.getAvailabilitiesByUser(juniorId);
      res.json(availabilities);
    } catch (err) {
      console.error("[GET_JUNIOR_AVAILABILITIES] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  // ==================== FEEDBACK ====================

  app.get("/api/interventions/pending-feedback", requireAuth, async (req, res) => {
    try {
      const interventions = await storage.getPendingFeedbackInterventions(req.user!.id);
      const needsFeedback = interventions.filter((intervention) => {
        const isSenior = intervention.relation.seniorId === req.user!.id;
        if (isSenior && intervention.seniorRating !== null) return false;
        if (!isSenior && intervention.juniorRating !== null) return false;
        return true;
      });
      // The other party's feedback must not reach the caller before (or after)
      // they give their own.
      res.json(
        needsFeedback.map((i) => scopeInterventionFeedback(i, req.user!.role as Role, req.user!.id, i.relation.seniorId))
      );
    } catch (err) {
      console.error("[PENDING_FEEDBACK] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.post("/api/interventions/:id/feedback", requireAuth, async (req, res) => {
    try {
      const intervention = await storage.getInterventionWithRelation(getParam(req, "id"));
      if (!intervention) {
        return res.status(404).json({ message: "Intervention non trouvée" });
      }
      if (intervention.status !== "COMPLETED_PENDING_FEEDBACK") {
        return res.status(400).json({ message: "Le feedback n'est pas encore attendu pour cette intervention" });
      }

      const userId = req.user!.id;
      const isSenior = intervention.relation.seniorId === userId;
      const isJunior = intervention.relation.juniorId === userId;

      if (!isSenior && !isJunior) {
        return res.status(403).json({ message: "Accès refusé" });
      }

      if (isSenior && intervention.seniorRating !== null) {
        return res.status(400).json({ message: "Vous avez déjà donné votre feedback" });
      }
      if (isJunior && intervention.juniorRating !== null) {
        return res.status(400).json({ message: "Vous avez déjà donné votre feedback" });
      }

      const parsed = feedbackSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Données invalides",
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const updateData: any = {};
      if (isSenior) {
        updateData.seniorRating = parsed.data.rating;
        updateData.seniorComment = parsed.data.comment || null;
      } else {
        updateData.juniorRating = parsed.data.rating;
        updateData.juniorComment = parsed.data.comment || null;
      }

      const currentIntervention = await storage.getIntervention(intervention.id);
      const seniorDone = isSenior ? true : currentIntervention!.seniorRating !== null;
      const juniorDone = isJunior ? true : currentIntervention!.juniorRating !== null;

      if (seniorDone && juniorDone) {
        updateData.status = "COMPLETED";
      }

      const updated = await storage.updateIntervention(intervention.id, updateData);

      const otherId = isSenior ? intervention.relation.juniorId : intervention.relation.seniorId;
      await storage.createNotification({
        user: { connect: { id: otherId } },
        type: "SYSTEM",
        title: "Feedback reçu",
        message: `${req.user!.firstName} ${req.user!.lastName} a laissé un feedback sur l'intervention.`,
        link: `/relations/${intervention.relationId}`,
      });

      // The other party may already have rated: never echo it back.
      res.json(scopeInterventionFeedback(updated, req.user!.role as Role, req.user!.id, intervention.relation.seniorId));
    } catch (err) {
      console.error("[FEEDBACK] Error:", err);
      res.status(500).json({ message: "Erreur lors de l'enregistrement du feedback" });
    }
  });

  // ==================== NPS (RECOMMANDATION DU SERVICE) ====================

  const NPS_INELIGIBLE_MESSAGES: Record<NpsIneligibleReason, string> = {
    ROLE: "Cette enquête ne concerne pas votre profil",
    NO_MEETING: "Vous pourrez donner votre avis après votre premier atelier",
    COOLDOWN: "Vous avez déjà donné votre avis récemment",
  };

  app.get("/api/nps/eligibility", requireAuth, async (req, res) => {
    try {
      const ineligible = await storage.getNpsIneligibility(req.user!);
      const response: NpsEligibilityResponse = { eligible: ineligible === null };
      res.json(response);
    } catch (err) {
      console.error("[NPS] Eligibility error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.post("/api/nps", requireAuth, async (req, res) => {
    try {
      const parsed = npsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Données invalides",
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await storage.createNpsResponse(req.user!, parsed.data);
      if ("ineligible" in result) {
        const status = result.ineligible === "COOLDOWN" ? 409 : 403;
        return res.status(status).json({ message: NPS_INELIGIBLE_MESSAGES[result.ineligible] });
      }

      res.status(201).json({ id: result.response.id });
    } catch (err) {
      console.error("[NPS] Error:", err);
      res.status(500).json({ message: "Erreur lors de l'enregistrement de votre avis" });
    }
  });

  // Names are returned for admin follow-up (calling back a detractor). The CSV
  // export built from this list drops them: the funder gets no identity.
  app.get("/api/admin/nps", requireAdmin, async (req, res) => {
    try {
      const parsed = npsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Paramètres invalides",
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      // Day boundaries are Guadeloupe days (server runs in UTC), end inclusive.
      const { from, to } = parsed.data;
      const rows = await storage.getNpsResponses({
        from: from ? gpDateTimeToUtc(from, 0, 0) : undefined,
        to: to ? new Date(gpDateTimeToUtc(addDaysISO(to, 1), 0, 0).getTime() - 1) : undefined,
      });

      const entries: NpsResponseEntry[] = rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        segment: row.role as NpsSegment,
        score: row.score,
        category: npsCategory(row.score),
        reason: row.reason,
        firstName: row.user?.firstName ?? null,
        lastName: row.user?.lastName ?? null,
      }));

      const report: NpsReport = buildNpsReport(entries);
      res.json(report);
    } catch (err) {
      console.error("[NPS] Admin report error:", err);
      res.status(500).json({ message: "Erreur lors du chargement des résultats" });
    }
  });

  // ==================== HISTORIQUE DES RENCONTRES ====================

  /**
   * Historique unifié, une seule route pour les cinq rôles.
   *
   * Deux garde-fous distincts, à ne pas confondre :
   *  - le PÉRIMÈTRE (quelles rencontres sont retournées) dérive de req.user ;
   *  - la VISIBILITÉ des feedbacks est ensuite réduite selon le rôle, avant
   *    sérialisation, pour que la réponse ne transporte jamais un commentaire
   *    que l'appelant n'a pas le droit de lire.
   *
   * `?userId=` n'élargit jamais le périmètre : réservé à l'admin, et au prof
   * pour ses seuls élèves affiliés.
   */
  app.get("/api/meetings/history", requireAuth, async (req, res) => {
    try {
      const parsed = meetingHistoryQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Paramètres invalides",
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const user = req.user!;
      const role = user.role as Role;
      const { userId, status, from, to } = parsed.data;

      let scope: MeetingHistoryScope;

      if (userId) {
        if (role === "ADMIN") {
          scope = { kind: "user", userId };
        } else if (role === "TEACHER") {
          const isLinked = await storage.isTeacherOfStudent(user.id, userId);
          if (!isLinked) {
            return res.status(403).json({ message: "Cet élève ne vous est pas affilié" });
          }
          scope = { kind: "user", userId };
        } else {
          return res.status(403).json({ message: "Accès refusé" });
        }
      } else if (role === "ADMIN") {
        scope = { kind: "all" };
      } else if (role === "TEACHER") {
        const students = await storage.getTeacherStudents(user.id);
        scope = { kind: "students", studentIds: students.map((s) => s.studentId) };
      } else if (role === "REFERENT_SENIOR") {
        const linkedSeniorId = (user as any).linkedSeniorId;
        if (!linkedSeniorId) {
          return res.status(404).json({ message: "Aucun sénior lié" });
        }
        scope = { kind: "senior", seniorId: linkedSeniorId };
      } else {
        scope = { kind: "user", userId: user.id };
      }

      const interventions = await storage.getMeetingHistory(scope, {
        status,
        from: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
        to: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
      });

      const entries = interventions
        .map((i) => toMeetingHistoryEntry(i))
        .map((e) => scopeFeedback(e, role, user.id));

      const response: MeetingHistoryResponse = {
        entries,
        summary: buildMeetingSummary(entries),
      };
      res.json(response);
    } catch (err) {
      console.error("[MEETING_HISTORY] Error:", err);
      res.status(500).json({ message: "Erreur lors du chargement de l'historique" });
    }
  });

  // ==================== ADMIN RECOMMENDATIONS ====================

  app.post("/api/admin/recommendations", requireAdmin, async (req, res) => {
    try {
      const { seniorId, juniorId, note } = req.body;
      if (!seniorId || !juniorId) {
        return res.status(400).json({ message: "seniorId et juniorId requis" });
      }
      const recommendation = await storage.createAdminRecommendation(seniorId, juniorId, note);
      res.status(201).json(recommendation);
    } catch (err: any) {
      if (err.code === "P2002") {
        return res.status(409).json({ message: "Cette recommandation existe déjà" });
      }
      console.error("[ADMIN_RECOMMENDATION] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.delete("/api/admin/recommendations/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteAdminRecommendation(getParam(req, "id"));
      res.json({ message: "Recommandation supprimée" });
    } catch (err) {
      console.error("[DELETE_RECOMMENDATION] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  // ==================== ADMIN DASHBOARD ====================

  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users.map(sanitizeUser));
    } catch (err) {
      console.error("[ADMIN_USERS] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.patch("/api/admin/users/:id/validate", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(getParam(req, "id"));
      if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });
      if (user.status !== "PENDING_VALIDATION") {
        return res.status(400).json({ message: "Cet utilisateur n'est pas en attente de validation" });
      }
      const updated = await storage.updateUser(user.id, { status: "ACTIVE", validationToken: null, validationExpiry: null });
      res.json(sanitizeUser(updated));
    } catch (err) {
      console.error("[ADMIN_VALIDATE] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.patch("/api/admin/users/:id/suspend", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(getParam(req, "id"));
      if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });
      if (user.role === "ADMIN") return res.status(403).json({ message: "Impossible de suspendre un administrateur" });
      const updated = await storage.updateUser(user.id, { status: "SUSPENDED" });
      res.json(sanitizeUser(updated));
    } catch (err) {
      console.error("[ADMIN_SUSPEND] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(getParam(req, "id"));
      if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });
      if (user.role === "ADMIN") return res.status(403).json({ message: "Impossible de supprimer un administrateur" });
      // La photo en base part avec l'utilisateur (ProfilePhoto est en cascade).
      // Ce nettoyage ne concerne que les photos d'avant la bascule, encore
      // présentes sur le disque.
      if (user.profilePhoto) {
        const photoPath = path.join(process.cwd(), user.profilePhoto.replace(/^\//, ""));
        if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
      }
      await storage.deleteUser(user.id);
      res.json({ message: "Utilisateur supprimé" });
    } catch (err) {
      console.error("[ADMIN_DELETE_USER] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.get("/api/admin/relations", requireAdmin, async (_req, res) => {
    try {
      const relations = await storage.getAllRelations();
      res.json(relations.map((r) => ({
        ...r,
        senior: sanitizeUser(r.senior),
        junior: sanitizeUser(r.junior),
      })));
    } catch (err) {
      console.error("[ADMIN_RELATIONS] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.patch("/api/admin/relations/:id/advance", requireAdmin, async (req, res) => {
    try {
      const relation = await storage.getRelation(getParam(req, "id"));
      if (!relation) return res.status(404).json({ message: "Relation non trouvée" });
      if (relation.status !== "PENDING") {
        return res.status(400).json({ message: "Seules les relations en attente peuvent être avancées" });
      }
      const updated = await storage.updateRelationStatus(relation.id, "PENDING_FIRST_MEETING");

      await storage.createNotification({
        user: { connect: { id: relation.seniorId } },
        type: "RELATION_REQUEST",
        title: "Demande acceptée",
        message: `Un administrateur ${PLATFORM_NAME} a validé l'accord du jeune. La première rencontre va être organisée.`,
        link: `/relations/${relation.id}`,
      });
      await storage.createNotification({
        user: { connect: { id: relation.juniorId } },
        type: "RELATION_REQUEST",
        title: "Relation confirmée",
        message: `Un administrateur ${PLATFORM_NAME} a confirmé votre participation. La première rencontre va être organisée.`,
        link: `/relations/${relation.id}`,
      });

      res.json(updated);
    } catch (err) {
      console.error("[ADMIN_ADVANCE_RELATION] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.get("/api/admin/relations/pending-meeting", requireAdmin, async (_req, res) => {
    try {
      const relations = await storage.getAllRelationsByStatus("PENDING_FIRST_MEETING");
      res.json(relations.map((r) => ({
        ...r,
        senior: sanitizeUser(r.senior),
        junior: sanitizeUser(r.junior),
      })));
    } catch (err) {
      console.error("[ADMIN_PENDING_MEETING] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.get("/api/admin/interventions", requireAdmin, async (_req, res) => {
    try {
      const interventions = await storage.getAllInterventions();
      res.json(interventions.map((i) => ({
        ...i,
        relation: {
          ...i.relation,
          senior: sanitizeUser(i.relation.senior),
          junior: sanitizeUser(i.relation.junior),
        },
      })));
    } catch (err) {
      console.error("[ADMIN_INTERVENTIONS] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.get("/api/admin/notifications", requireAdmin, async (_req, res) => {
    try {
      const notifications = await storage.getAllNotifications();
      res.json(notifications.map((n) => ({
        ...n,
        user: sanitizeUser(n.user),
      })));
    } catch (err) {
      console.error("[ADMIN_NOTIFICATIONS] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.get("/api/admin/payments", requireAdmin, async (_req, res) => {
    try {
      const payments = await storage.getPayments();
      res.json(payments.map((p) => ({
        ...p,
        user: sanitizeUser(p.user),
      })));
    } catch (err) {
      console.error("[ADMIN_PAYMENTS] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.post("/api/admin/create-admin", requireAdmin, async (req, res) => {
    try {
      const parsed = createAdminSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
      }

      const existing = await storage.getUserByEmail(parsed.data.email.toLowerCase().trim());
      if (existing) {
        return res.status(409).json({ message: "Cet email est déjà utilisé" });
      }

      const hashedPassword = await bcrypt.hash(parsed.data.password, 10);
      const user = await storage.createUser({
        email: parsed.data.email.toLowerCase().trim(),
        password: hashedPassword,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        role: "ADMIN",
        status: "ACTIVE",
      });

      res.status(201).json(sanitizeUser(user));
    } catch (err) {
      console.error("[CREATE_ADMIN] Error:", err);
      res.status(500).json({ message: "Erreur lors de la création du compte admin" });
    }
  });

  app.post("/api/admin/payments", requireAdmin, async (req, res) => {
    try {
      const parsed = createPaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
      }
      const user = await storage.getUser(parsed.data.userId);
      if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });

      let creditSeniorId: string | null = null;
      if (parsed.data.credits) {
        if (user.role === "SENIOR") {
          creditSeniorId = user.id;
        } else if (user.role === "REFERENT_SENIOR" && user.linkedSeniorId) {
          creditSeniorId = user.linkedSeniorId;
        } else {
          return res.status(400).json({
            message: "Impossible d'attribuer des crédits : cet utilisateur n'est ni un senior, ni un référent lié à un senior",
          });
        }
      }

      const payment = await storage.createPayment({
        userId: parsed.data.userId,
        amount: parsed.data.amount,
        label: parsed.data.label,
        date: parsed.data.date ? new Date(parsed.data.date) : undefined,
        credits: parsed.data.credits,
        creditSeniorId,
        triggeredById: req.user!.id,
      });
      res.status(201).json(payment);
    } catch (err) {
      console.error("[ADMIN_CREATE_PAYMENT] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  // ==================== MESSAGING (SSE) ====================

  app.get("/api/messages/stream", requireAuth, (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("event: connected\ndata: {}\n\n");

    addSSEClient(req.user!.id, res);

    const heartbeat = setInterval(() => {
      try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
    }, 30000);

    req.on("close", () => clearInterval(heartbeat));
  });

  app.get("/api/messages/unread-count", requireAuth, async (req, res) => {
    try {
      const count = await storage.getUnreadMessageCountForUser(req.user!.id);
      res.json({ count });
    } catch (err) {
      console.error("[MSG_UNREAD] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.get("/api/messages/conversations", requireAuth, async (req, res) => {
    try {
      const conversations = await storage.getConversationsForUser(req.user!.id);
      res.json(conversations);
    } catch (err) {
      console.error("[MSG_CONVERSATIONS] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.get("/api/messages/conversations/:id", requireAuth, async (req, res) => {
    try {
      const relationId = getParam(req, "id") as string;
      const relation = await storage.getRelationWithUsers(relationId);
      if (!relation) return res.status(404).json({ message: "Relation non trouvée" });

      const userId = req.user!.id;
      if (relation.seniorId !== userId && relation.juniorId !== userId) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      if (relation.status !== "ACTIVE") {
        return res.status(400).json({ message: "La messagerie n'est disponible qu'après la première rencontre" });
      }

      const conv = await storage.getOrCreateConversation(relationId);
      const limit = parseInt(req.query.limit as string) || 50;
      const cursor = req.query.cursor as string | undefined;
      const messages = await storage.getMessages(conv.id, limit, cursor);
      res.json({ messages, conversationId: conv.id });
    } catch (err) {
      console.error("[MSG_GET] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.post("/api/messages/conversations/:id", requireAuth, async (req, res) => {
    try {
      const { content } = req.body;
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ message: "Le message ne peut pas être vide" });
      }
      if (content.length > 2000) {
        return res.status(400).json({ message: "Le message est trop long (max 2000 caractères)" });
      }

      const relationId = getParam(req, "id") as string;
      const relation = await storage.getRelationWithUsers(relationId);
      if (!relation) return res.status(404).json({ message: "Relation non trouvée" });

      const userId = req.user!.id;
      if (relation.seniorId !== userId && relation.juniorId !== userId) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      if (relation.status !== "ACTIVE") {
        return res.status(400).json({ message: "La messagerie n'est disponible qu'après la première rencontre" });
      }

      const conv = await storage.getOrCreateConversation(relationId);
      const message = await storage.createMessage(conv.id, userId, content.trim());

      const recipientId = relation.seniorId === userId ? relation.juniorId : relation.seniorId;
      const senderName = `${req.user!.firstName} ${req.user!.lastName}`;

      sendSSEEvent(recipientId, "new_message", {
        message,
        conversationId: conv.id,
        relationId: relationId,
      });

      sendSSEEvent(userId, "message_sent", {
        message,
        conversationId: conv.id,
        relationId: relationId,
      });

      if (!isUserConnected(recipientId)) {
        sendPushNotification(recipientId, {
          title: `Nouveau message de ${senderName}`,
          body: content.trim().substring(0, 100),
          url: `/`,
        }).catch(console.error);
      }

      res.status(201).json(message);
    } catch (err) {
      console.error("[MSG_SEND] Error:", err);
      res.status(500).json({ message: "Erreur lors de l'envoi du message" });
    }
  });

  app.patch("/api/messages/conversations/:id/read", requireAuth, async (req, res) => {
    try {
      const relationId = getParam(req, "id") as string;
      const relation = await storage.getRelationWithUsers(relationId);
      if (!relation) return res.status(404).json({ message: "Relation non trouvée" });

      const userId = req.user!.id;
      if (relation.seniorId !== userId && relation.juniorId !== userId) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      if (relation.status !== "ACTIVE") {
        return res.status(400).json({ message: "La messagerie n'est disponible qu'après la première rencontre" });
      }

      const conv = await storage.getOrCreateConversation(relationId);
      const count = await storage.markMessagesAsRead(conv.id, userId);

      if (count > 0) {
        const otherId = relation.seniorId === userId ? relation.juniorId : relation.seniorId;
        sendSSEEvent(otherId, "messages_read", { conversationId: conv.id, relationId: relationId });
      }

      res.json({ count });
    } catch (err) {
      console.error("[MSG_READ] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  // ==================== PUSH NOTIFICATIONS ====================

  app.get("/api/push/vapid-key", (_req, res) => {
    const key = getVapidPublicKey();
    res.json({ key });
  });

  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    try {
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: "Données de souscription invalides" });
      }
      await storage.createPushSubscription(req.user!.id, endpoint, keys.p256dh, keys.auth);
      res.json({ message: "Souscription enregistrée" });
    } catch (err) {
      console.error("[PUSH_SUB] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  // ==================== ADMIN MESSAGING ====================

  app.get("/api/admin/messages/conversations", requireAdmin, async (_req, res) => {
    try {
      const conversations = await storage.getAllConversations();
      res.json(conversations);
    } catch (err) {
      console.error("[ADMIN_MSG_CONV] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.get("/api/admin/messages/conversations/:id", requireAdmin, async (req, res) => {
    try {
      const { prisma } = await import("./prisma");
      const conv = await prisma.conversation.findUnique({
        where: { id: getParam(req, "id") },
        include: {
          relation: {
            include: {
              senior: { select: { id: true, firstName: true, lastName: true, email: true, profilePhoto: true } },
              junior: { select: { id: true, firstName: true, lastName: true, email: true, profilePhoto: true } },
            },
          },
        },
      });
      if (!conv) {
        const convByRelation = await prisma.conversation.findUnique({
          where: { relationId: getParam(req, "id") },
          include: {
            relation: {
              include: {
                senior: { select: { id: true, firstName: true, lastName: true, email: true, profilePhoto: true } },
                junior: { select: { id: true, firstName: true, lastName: true, email: true, profilePhoto: true } },
              },
            },
          },
        });
        if (!convByRelation) return res.status(404).json({ message: "Conversation non trouvée" });
        const messages = await prisma.message.findMany({
          where: { conversationId: convByRelation.id },
          orderBy: { createdAt: "desc" },
          take: 200,
          include: {
            sender: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
          },
        });
        return res.json({ conversation: convByRelation, messages });
      }
      const messages = await prisma.message.findMany({
        where: { conversationId: conv.id },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
        },
      });
      res.json({ conversation: conv, messages });
    } catch (err) {
      console.error("[ADMIN_MSG_DETAIL] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.delete("/api/admin/messages/:messageId", requireAdmin, async (req, res) => {
    try {
      const message = await storage.deleteMessage(getParam(req, "messageId"));
      const { prisma } = await import("./prisma");
      const conv = await prisma.conversation.findUnique({
        where: { id: message.conversationId },
        include: { relation: true },
      });
      if (conv) {
        sendSSEEvent(conv.relation.seniorId, "message_deleted", { messageId: message.id, conversationId: conv.id, relationId: conv.relationId });
        sendSSEEvent(conv.relation.juniorId, "message_deleted", { messageId: message.id, conversationId: conv.id, relationId: conv.relationId });
      }
      res.json(message);
    } catch (err) {
      console.error("[ADMIN_MSG_DELETE] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  // ─── Signalements ──────────────────────────────────────────────────────────

  app.post("/api/reports", requireAuth, async (req, res) => {
    const parsed = insertReportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });

    const { reason, relationId, message } = parsed.data;
    const reporterId = req.user!.id;

    let targetId: string | undefined;
    if (reason === "PERSON" && relationId) {
      const relation = await storage.getRelation(relationId);
      if (!relation || (relation.seniorId !== reporterId && relation.juniorId !== reporterId)) {
        return res.status(400).json({ message: "Relation invalide" });
      }
      targetId = relation.seniorId === reporterId ? relation.juniorId : relation.seniorId;
    }

    try {
      const report = await storage.createReport({
        reporterId,
        targetId,
        relationId,
        reason,
        message: message || "",
      });
      res.status(201).json(report);

      const reporter = await storage.getUser(reporterId);
      const reporterName = reporter ? `${reporter.firstName} ${reporter.lastName}` : "Utilisateur inconnu";
      const adminUrl = `${process.env.BASE_URL || ""}/admin`;
      const admins = await storage.getAdmins();
      for (const admin of admins) {
        // sendEmail attend un objet { to, subject, htmlContent }. Auparavant
        // appelé en positionnel → to/subject/htmlContent devenaient undefined →
        // les admins ne recevaient jamais les signalements.
        sendEmail({
          to: admin.email,
          subject: `Nouveau signalement reçu - ${PLATFORM_NAME}`,
          htmlContent: getNewReportEmailHtml(admin.firstName, reporterName, reason, message || null, adminUrl),
        }).catch((err) => console.error("[REPORT_EMAIL] Error sending to admin:", err));
      }
    } catch (err) {
      console.error("[REPORT_CREATE] Error:", err);
      res.status(500).json({ message: "Erreur lors de l'envoi du signalement" });
    }
  });

  app.get("/api/admin/reports", requireAdmin, async (_req, res) => {
    try {
      const reports = await storage.getReports();
      res.json(reports);
    } catch (err) {
      console.error("[ADMIN_REPORTS] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.get("/api/admin/reports/count", requireAdmin, async (_req, res) => {
    try {
      const count = await storage.getOpenReportCount();
      res.json({ count });
    } catch (err) {
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.patch("/api/admin/reports/:id/handle", requireAdmin, async (req, res) => {
    const { handledNote } = req.body;
    if (!handledNote || typeof handledNote !== "string" || handledNote.trim().length === 0) {
      return res.status(400).json({ message: "Un commentaire de traitement est obligatoire." });
    }
    try {
      const report = await storage.updateReportStatus(getParam(req, "id"), "HANDLED", handledNote.trim());
      res.json(report);
    } catch (err) {
      console.error("[ADMIN_REPORT_HANDLE] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  // ==================== ADMIN — RÉFÉRENTS SÉNIORS ====================

  app.get("/api/admin/seniors/active", requireAdmin, async (_req, res) => {
    try {
      const seniors = await storage.getSeniorsByStatus("ACTIVE");
      res.json(seniors.map(sanitizeUser));
    } catch (err) {
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.post("/api/admin/referents", requireAdmin, async (req, res) => {
    try {
      const { createReferentSchema } = await import("../shared/schema");
      const parsed = createReferentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten().fieldErrors });
      }
      const { email, password, firstName, lastName, linkedSeniorId, phone } = parsed.data;

      const existing = await storage.getUserByEmail(email.toLowerCase().trim());
      if (existing) return res.status(409).json({ message: "Cet email est déjà utilisé" });

      const senior = await storage.getUser(linkedSeniorId);
      if (!senior || senior.role !== "SENIOR") return res.status(400).json({ message: "Sénior invalide" });

      const hashedPassword = await bcrypt.hash(password, 10);
      const referent = await storage.createUser({
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        firstName,
        lastName,
        role: "REFERENT_SENIOR",
        status: "ACTIVE",
        phone: phone || null,
        // UserCreateInput (checked) attend la relation, pas le scalar FK.
        linkedSenior: { connect: { id: linkedSeniorId } },
        profilePhoto: `https://ui-avatars.com/api/?name=${encodeURIComponent(firstName + "+" + lastName)}&background=8b5cf6&color=fff&size=200`,
      });

      res.status(201).json(sanitizeUser(referent));
    } catch (err) {
      console.error("[ADMIN_CREATE_REFERENT] Error:", err);
      res.status(500).json({ message: "Erreur lors de la création du référent" });
    }
  });

  // ==================== TEACHER ====================

  function requireTeacher(req: any, res: any, next: any) {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Non authentifié" });
    if (req.user?.role !== "TEACHER") return res.status(403).json({ message: "Accès réservé aux professeurs" });
    next();
  }

  // GET /api/teacher/students — liste des élèves du prof
  app.get("/api/teacher/students", requireTeacher, async (req, res) => {
    try {
      const teacherId = (req.user as any).id;
      const links = await storage.getTeacherStudents(teacherId);
      const students = links.map((l) => ({
        ...sanitizeUserPublic(l.student),
        linkedAt: l.createdAt,
      }));
      res.json(students);
    } catch (err) {
      console.error("[TEACHER_STUDENTS] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  // GET /api/teacher/students/:id — fiche élève complète (relations + interventions + feedback)
  app.get("/api/teacher/students/:id", requireTeacher, async (req, res) => {
    try {
      const teacherId = (req.user as any).id;
      const isLinked = await storage.isTeacherOfStudent(teacherId, getParam(req, "id"));
      if (!isLinked) return res.status(403).json({ message: "Cet élève ne vous est pas affilié" });

      const student = await storage.getUser(getParam(req, "id"));
      if (!student || student.role !== "JUNIOR") return res.status(404).json({ message: "Élève introuvable" });

      // Toutes les relations avec leur sénior et interventions complètes (feedback inclus)
      const relations = await storage.getRelationsByUser(student.id);
      const relationsFormatted = relations.map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        senior: sanitizeUserPublic(r.senior),
        interventions: (r.interventions || []).map((i) => ({
          id: i.id,
          scheduledDate: i.scheduledDate,
          durationMinutes: i.durationMinutes,
          location: i.location,
          tasks: i.tasks,
          status: i.status,
          seniorRating: i.seniorRating,
          seniorComment: i.seniorComment,
          juniorRating: i.juniorRating,
          juniorComment: i.juniorComment,
        })),
      }));

      const comments = await storage.getTeacherComments(student.id);

      res.json({
        student: sanitizeUserPublic(student),
        relations: relationsFormatted,
        comments: comments.map((c) => ({
          id: c.id,
          content: c.content,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          teacherName: `${c.teacher.firstName} ${c.teacher.lastName}`,
          isOwn: c.teacherId === teacherId,
        })),
      });
    } catch (err) {
      console.error("[TEACHER_STUDENT_DETAIL] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  // PATCH /api/teacher/students/:id/bio — édition bio par le prof
  app.patch("/api/teacher/students/:id/bio", requireTeacher, async (req, res) => {
    try {
      const teacherId = (req.user as any).id;
      const isLinked = await storage.isTeacherOfStudent(teacherId, getParam(req, "id"));
      if (!isLinked) return res.status(403).json({ message: "Cet élève ne vous est pas affilié" });

      const { updateStudentBioSchema } = await import("../shared/schema");
      const parsed = updateStudentBioSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten().fieldErrors });

      const student = await storage.updateUser(getParam(req, "id"), parsed.data);
      res.json(sanitizeUserPublic(student));
    } catch (err) {
      console.error("[TEACHER_UPDATE_BIO] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  // POST /api/teacher/students/:id/comments — notifie les admins par email
  app.post("/api/teacher/students/:id/comments", requireTeacher, async (req, res) => {
    try {
      const teacherId = (req.user as any).id;
      const isLinked = await storage.isTeacherOfStudent(teacherId, getParam(req, "id"));
      if (!isLinked) return res.status(403).json({ message: "Cet élève ne vous est pas affilié" });

      const { createTeacherCommentSchema } = await import("../shared/schema");
      const parsed = createTeacherCommentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten().fieldErrors });

      const comment = await storage.createTeacherComment(teacherId, getParam(req, "id"), parsed.data.content);

      // Notification email aux admins
      const teacher = req.user as any;
      const student = await storage.getUser(getParam(req, "id"));
      const admins = await storage.getAdmins();
      const teacherName = `${teacher.firstName} ${teacher.lastName}`;
      const studentName = student ? `${student.firstName} ${student.lastName}` : "un élève";
      const baseUrl = process.env.BASE_URL || getBaseUrl(req);
      for (const admin of admins) {
        sendEmail({
          to: admin.email,
          subject: `${PLATFORM_NAME} — Note professeur de ${teacherName} sur ${studentName}`,
          htmlContent: `<h2 style="color:#16a34a">Nouvelle note professeur</h2><p><strong>Professeur :</strong> ${teacherName} (${teacher.email})</p><p><strong>Élève :</strong> ${studentName}</p><hr><p>${parsed.data.content.replace(/\n/g, "<br>")}</p><hr><p><a href="${baseUrl}/admin">Voir dans l'espace admin → onglet "Notes profs"</a></p>`,
        }).catch(console.error);
      }

      res.status(201).json(comment);
    } catch (err) {
      console.error("[TEACHER_CREATE_COMMENT] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  // PATCH /api/teacher/students/:studentId/comments/:commentId
  app.patch("/api/teacher/students/:studentId/comments/:commentId", requireTeacher, async (req, res) => {
    try {
      const teacherId = (req.user as any).id;
      const { updateTeacherCommentSchema } = await import("../shared/schema");
      const parsed = updateTeacherCommentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten().fieldErrors });

      const comment = await storage.updateTeacherComment(getParam(req, "commentId"), teacherId, parsed.data.content);
      res.json(comment);
    } catch (err) {
      console.error("[TEACHER_UPDATE_COMMENT] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  // DELETE /api/teacher/students/:studentId/comments/:commentId
  app.delete("/api/teacher/students/:studentId/comments/:commentId", requireTeacher, async (req, res) => {
    try {
      const teacherId = (req.user as any).id;
      await storage.deleteTeacherComment(getParam(req, "commentId"), teacherId);
      res.json({ message: "Commentaire supprimé" });
    } catch (err) {
      console.error("[TEACHER_DELETE_COMMENT] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  // ==================== ADMIN — TEACHERS ====================

  app.get("/api/admin/teachers", requireAdmin, async (_req, res) => {
    try {
      const teachers = await storage.getAllTeachers();
      res.json(teachers.map(sanitizeUser));
    } catch (err) {
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.post("/api/admin/teachers", requireAdmin, async (req, res) => {
    try {
      const { createTeacherSchema } = await import("../shared/schema");
      const parsed = createTeacherSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten().fieldErrors });

      const { email, password, firstName, lastName, phone } = parsed.data;
      const existing = await storage.getUserByEmail(email.toLowerCase().trim());
      if (existing) return res.status(409).json({ message: "Cet email est déjà utilisé" });

      const hashedPassword = await bcrypt.hash(password, 10);
      const teacher = await storage.createUser({
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        firstName,
        lastName,
        role: "TEACHER",
        status: "ACTIVE",
        phone: phone || null,
        profilePhoto: `https://ui-avatars.com/api/?name=${encodeURIComponent(firstName + "+" + lastName)}&background=16a34a&color=fff&size=200`,
      });

      res.status(201).json(sanitizeUser(teacher));
    } catch (err) {
      console.error("[ADMIN_CREATE_TEACHER] Error:", err);
      res.status(500).json({ message: "Erreur lors de la création du professeur" });
    }
  });

  app.get("/api/admin/teachers/:teacherId/students", requireAdmin, async (req, res) => {
    try {
      const links = await storage.getTeacherStudents(getParam(req, "teacherId"));
      res.json(links.map((l) => ({ ...sanitizeUser(l.student), linkedAt: l.createdAt })));
    } catch (err) {
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.post("/api/admin/teachers/:teacherId/students", requireAdmin, async (req, res) => {
    try {
      const { studentId } = req.body;
      if (!studentId) return res.status(400).json({ message: "studentId requis" });
      const student = await storage.getUser(studentId);
      if (!student || student.role !== "JUNIOR") return res.status(400).json({ message: "Élève invalide" });
      const link = await storage.addTeacherStudent(getParam(req, "teacherId"), studentId);
      res.status(201).json(link);
    } catch (err: any) {
      if (err.code === "P2002") return res.status(409).json({ message: "Liaison déjà existante" });
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.delete("/api/admin/teachers/:teacherId/students/:studentId", requireAdmin, async (req, res) => {
    try {
      await storage.removeTeacherStudent(getParam(req, "teacherId"), getParam(req, "studentId"));
      res.json({ message: "Liaison supprimée" });
    } catch (err) {
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.get("/api/admin/teacher-comments", requireAdmin, async (_req, res) => {
    try {
      const comments = await storage.getAllTeacherComments();
      res.json(comments.map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        teacher: sanitizeUserPublic(c.teacher),
        student: sanitizeUserPublic(c.student),
      })));
    } catch (err) {
      res.status(500).json({ message: "Erreur" });
    }
  });

  // ==================== RÉFÉRENT SÉNIOR ====================

  function requireReferent(req: any, res: any, next: any) {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Non authentifié" });
    if (req.user?.role !== "REFERENT_SENIOR") return res.status(403).json({ message: "Accès réservé aux référents séniors" });
    next();
  }

  app.get("/api/referent/senior", requireReferent, async (req, res) => {
    try {
      const linkedSeniorId = (req.user as any).linkedSeniorId;
      if (!linkedSeniorId) return res.status(404).json({ message: "Aucun sénior lié" });
      const senior = await storage.getUser(linkedSeniorId);
      if (!senior) return res.status(404).json({ message: "Sénior non trouvé" });
      res.json(sanitizeUserPublic(senior));
    } catch (err) {
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.get("/api/referent/relations", requireReferent, async (req, res) => {
    try {
      const linkedSeniorId = (req.user as any).linkedSeniorId;
      if (!linkedSeniorId) return res.status(404).json({ message: "Aucun sénior lié" });
      const relations = await storage.getRelationsBySeniorId(linkedSeniorId);
      res.json(relations.map((r) => ({
        ...r,
        senior: sanitizeUserPublic(r.senior),
        junior: sanitizeUserPublic(r.junior),
        // A referent sees the senior's feedback, never the junior's.
        interventions: r.interventions.map((i) =>
          scopeInterventionFeedback(i, "REFERENT_SENIOR", req.user!.id, r.seniorId)
        ),
      })));
    } catch (err) {
      console.error("[REFERENT_RELATIONS] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.post("/api/referent/interventions", requireReferent, async (req, res) => {
    try {
      const { referentInterventionSchema } = await import("../shared/schema");
      const parsed = referentInterventionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten().fieldErrors });
      }

      const linkedSeniorId = (req.user as any).linkedSeniorId;
      if (!linkedSeniorId) return res.status(403).json({ message: "Aucun sénior lié" });

      const relation = await storage.getRelationWithUsers(parsed.data.relationId);
      if (!relation) return res.status(404).json({ message: "Relation non trouvée" });
      if (relation.seniorId !== linkedSeniorId) return res.status(403).json({ message: "Cette relation n'appartient pas à votre sénior" });
      if (relation.status !== "ACTIVE") return res.status(400).json({ message: "La relation doit être active pour planifier une intervention" });

      const scheduledDate = new Date(parsed.data.scheduledDate);
      if (Number.isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ message: "Date invalide" });
      }

      const slotError = await validateSlot(relation.juniorId, scheduledDate, parsed.data.durationMinutes);
      if (slotError) {
        return res.status(400).json({ message: slotError });
      }

      const result = await createInterventionOrConflict(relation.juniorId, relation.seniorId, {
        relationId: parsed.data.relationId,
        scheduledDate,
        durationMinutes: parsed.data.durationMinutes,
        location: parsed.data.location,
        tasks: parsed.data.tasks,
      });
      if ("noCredits" in result) {
        return res.status(402).json({ message: NO_CREDITS_MESSAGE, code: "INSUFFICIENT_CREDITS" });
      }
      if ("conflict" in result) {
        return res.status(400).json({ message: SLOT_CONFLICT_MESSAGE });
      }
      if ("locked" in result) {
        return res.status(409).json({ message: LOCK_CONTENTION_MESSAGE });
      }
      const intervention = result.intervention;

      const referentUser = req.user as any;
      const senderName = `${referentUser.firstName} ${referentUser.lastName} (référent de ${relation.senior.firstName} ${relation.senior.lastName})`;
      await storage.createNotification({
        user: { connect: { id: relation.juniorId } },
        type: "INTERVENTION_PROPOSED",
        title: "Nouvelle intervention proposée",
        message: `${senderName} propose une intervention le ${fmtDayNumeric(new Date(parsed.data.scheduledDate))} à ${fmtTime(new Date(parsed.data.scheduledDate))}.`,
        link: null,
      });
      sendSSEEvent(relation.juniorId, "invalidate", { queryKey: ["/api/relations"] });

      res.status(201).json(intervention);
    } catch (err) {
      console.error("[REFERENT_INTERVENTION] Error:", err);
      res.status(500).json({ message: "Erreur lors de la création de l'intervention" });
    }
  });

  app.get("/api/credits/balance", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      let seniorId: string;
      if (user.role === "SENIOR") {
        seniorId = user.id;
      } else if (user.role === "REFERENT_SENIOR" && user.linkedSeniorId) {
        seniorId = user.linkedSeniorId;
      } else if (user.role === "ADMIN" && typeof req.query.seniorId === "string") {
        seniorId = req.query.seniorId;
      } else {
        return res.status(400).json({ message: "Impossible de déterminer le solde de crédits pour cet utilisateur" });
      }
      const balance = await storage.getCreditBalance(seniorId);
      res.json({ balance });
    } catch (err) {
      console.error("[CREDITS_BALANCE] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.get("/api/credits/history", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      let seniorId: string;
      if (user.role === "SENIOR") {
        seniorId = user.id;
      } else if (user.role === "REFERENT_SENIOR" && user.linkedSeniorId) {
        seniorId = user.linkedSeniorId;
      } else if (user.role === "ADMIN" && typeof req.query.seniorId === "string") {
        seniorId = req.query.seniorId;
      } else {
        return res.status(400).json({ message: "Impossible de déterminer l'historique de crédits pour cet utilisateur" });
      }
      const history = await storage.getCreditLedger(seniorId);
      res.json(history);
    } catch (err) {
      console.error("[CREDITS_HISTORY] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.post("/api/credits/checkout", requireAuth, checkoutLimiter, async (req, res) => {
    try {
      if (!paymentProvider.isConfigured()) {
        return res.status(503).json({ message: "Le paiement en ligne n'est pas disponible actuellement." });
      }

      const parsed = checkoutSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
      }
      const offer = findCreditOffer(parsed.data.offerId);
      if (!offer) {
        return res.status(400).json({ message: "Offre invalide" });
      }

      const user = req.user as any;
      let seniorId: string;
      if (user.role === "SENIOR") {
        seniorId = user.id;
      } else if (user.role === "REFERENT_SENIOR" && user.linkedSeniorId) {
        seniorId = user.linkedSeniorId;
      } else {
        return res.status(400).json({ message: "Seul un sénior ou un référent lié à un sénior peut acheter des crédits" });
      }

      const baseUrl = getBaseUrl(req);
      const { url } = await paymentProvider.createCheckoutSession({
        offerId: offer.id,
        offerLabel: offer.label,
        priceEuros: offer.priceEuros,
        seniorId,
        purchasedByUserId: user.id,
        successUrl: `${baseUrl}/credits/success`,
        cancelUrl: `${baseUrl}/credits/cancel`,
      });

      res.json({ url });
    } catch (err) {
      console.error("[CREDITS_CHECKOUT] Error:", err);
      res.status(500).json({ message: "Erreur lors de la création du paiement" });
    }
  });

  app.post("/api/webhooks/payment", async (req, res) => {
    if (!paymentProvider.isConfigured()) return res.status(503).send();

    const event = paymentProvider.verifyWebhookAndExtract(
      req.rawBody as Buffer,
      req.headers["stripe-signature"] as string | undefined
    );
    if (!event) {
      return res.status(400).send("Webhook invalide");
    }

    // Événement valide à partir d'ici. 200 pour ce qui est déjà traité ou ne le
    // sera jamais (doublon, offre inconnue, compte supprimé) ; 500 pour une
    // erreur passagère (base injoignable, timeout) afin que Stripe réessaie —
    // sinon le client est débité sans recevoir ses crédits. Rejouer est sans
    // risque : stripeSessionId est unique.
    try {
      const existing = await storage.getPaymentByStripeSessionId(event.externalSessionId);
      if (existing) {
        return res.status(200).send();
      }

      const offer = findCreditOffer(event.metadata.offerId);
      if (!offer) {
        console.error(`[PAYMENT_WEBHOOK] Offre inconnue "${event.metadata.offerId}" sur ${event.externalSessionId}`);
        return res.status(200).send();
      }

      const { seniorId, purchasedByUserId } = event.metadata;

      try {
        await storage.createPayment({
          userId: purchasedByUserId,
          amount: event.amountPaidEuros,
          label: `Achat en ligne — ${offer.label}`,
          credits: offer.credits,
          creditSeniorId: seniorId,
          triggeredById: purchasedByUserId,
          stripeSessionId: event.externalSessionId,
        });
      } catch (err: any) {
        // Livraison concurrente du même événement : l'autre l'a enregistré.
        if (err?.code === "P2002") return res.status(200).send();
        // Payeur ou senior supprimé entre le paiement et le webhook : rejouer
        // n'y changera rien, un admin doit rembourser à la main.
        if (err?.code === "P2003" || err?.code === "P2025") {
          console.error(
            `[PAYMENT_WEBHOOK] Paiement ${event.externalSessionId} non crédité : compte introuvable ` +
              `(senior ${seniorId}, payeur ${purchasedByUserId}). Remboursement manuel nécessaire.`
          );
          return res.status(200).send();
        }
        throw err;
      }

      try {
        const senior = await storage.getUser(seniorId);
        const balance = await storage.getCreditBalance(seniorId);
        if (senior) {
          await sendEmail({
            to: senior.email,
            subject: `Confirmation de votre achat — ${PLATFORM_NAME}`,
            htmlContent: getCreditPurchaseConfirmedEmailHtml(`${senior.firstName} ${senior.lastName}`, offer.label, balance),
          });
        }
        if (purchasedByUserId !== seniorId) {
          const payeur = await storage.getUser(purchasedByUserId);
          if (payeur) {
            await sendEmail({
              to: payeur.email,
              subject: `Confirmation de votre achat — ${PLATFORM_NAME}`,
              htmlContent: getCreditPurchaseConfirmedEmailHtml(`${payeur.firstName} ${payeur.lastName}`, offer.label, balance),
            });
          }
        }
      } catch (emailErr) {
        console.error("[PAYMENT_WEBHOOK] Échec envoi email:", emailErr);
      }

      res.status(200).send();
    } catch (err) {
      console.error("[PAYMENT_WEBHOOK] Erreur passagère, Stripe va réessayer:", err);
      res.status(500).send();
    }
  });

  app.post("/api/referent/contact-admin", requireReferent, async (req, res) => {
    try {
      const { referentContactSchema } = await import("../shared/schema");
      const parsed = referentContactSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten().fieldErrors });
      }

      const user = req.user as any;
      const { subject, message } = parsed.data;

      await storage.createReport({
        reporterId: user.id,
        reason: "OTHER",
        message: `[Contact référent — ${subject}]\n\n${message}`,
      });

      const admins = await storage.getAdmins();
      const senderName = `${user.firstName} ${user.lastName}`;
      const baseUrl = process.env.BASE_URL || getBaseUrl(req);
      for (const admin of admins) {
        sendEmail({
          to: admin.email,
          subject: `${PLATFORM_NAME} — Message du référent sénior ${senderName} : ${subject}`,
          htmlContent: `<h2 style="color:#8b5cf6">Message du référent sénior</h2><p><strong>De :</strong> ${senderName} (${user.email})</p><p><strong>Sujet :</strong> ${subject}</p><hr><p>${message.replace(/\n/g, "<br>")}</p><hr><p><a href="${baseUrl}/admin">Voir dans l'espace admin</a></p>`,
        }).catch(console.error);
      }

      res.json({ message: `Votre message a été envoyé à l'équipe ${PLATFORM_NAME}.` });
    } catch (err) {
      console.error("[REFERENT_CONTACT] Error:", err);
      res.status(500).json({ message: "Erreur lors de l'envoi du message" });
    }
  });

  return httpServer;
}
