import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import rateLimit from "express-rate-limit";
import { fileTypeFromFile } from "file-type";
import { requireAuth, requireAdmin } from "./auth";
import { storage } from "./storage";
import { sendEmail } from "./lib/email";
import {
  getValidationEmailHtml,
  getRelationAcceptedEmailHtml,
  getInterventionProposedEmailHtml,
  getInterventionConfirmedEmailHtml,
  getFeedbackReminderEmailHtml,
  getNewReportEmailHtml,
} from "./lib/email-templates";
import { insertUserSchema, createRelationSchema, insertInterventionSchema, feedbackSchema, createPaymentSchema, changePasswordSchema, createAdminSchema, insertReportSchema } from "../shared/schema";
import { addSSEClient, sendSSEEvent, isUserConnected } from "./lib/sse";
import { sendPushNotification, getVapidPublicKey } from "./lib/push";

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
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

function sanitizeUser(user: any) {
  const { password, validationToken, validationExpiry, ...safe } = user;
  return safe;
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

async function validateImageMagicBytes(filePath: string): Promise<void> {
  const type = await fileTypeFromFile(filePath);
  const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
  if (!type || !allowedMimes.includes(type.mime)) {
    fs.unlinkSync(filePath);
    throw new Error("Fichier invalide : seuls les formats JPG, PNG et WebP sont acceptés.");
  }
}

function getBaseUrl(req: any): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5000";
  return `${proto}://${host}`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/auth/register", registerLimiter, upload.single("photo"), async (req, res) => {
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

      if (req.file) {
        try {
          await validateImageMagicBytes(req.file.path);
        } catch (validationErr: any) {
          return res.status(400).json({ message: validationErr.message });
        }
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);
      const validationToken = crypto.randomUUID();
      const validationExpiry = new Date(Date.now() + VALIDATION_TOKEN_TTL_MS);

      const { categoryIds, birthDate, ...userData } = data;

      const profilePhoto = req.file ? `/uploads/${req.file.filename}` : undefined;

      const user = await storage.createUser({
        ...userData,
        email: userData.email.toLowerCase().trim(),
        password: hashedPassword,
        birthDate: birthDate ? new Date(birthDate) : null,
        status: "PENDING_VALIDATION",
        role: userData.role,
        validationToken,
        validationExpiry,
        ...(profilePhoto ? { profilePhoto } : {}),
      });

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
        subject: `FEVES - Validation d'inscription de ${userName}`,
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

  app.post("/api/auth/me/photo", requireAuth, upload.single("photo"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Aucun fichier envoyé" });
      }
      try {
        await validateImageMagicBytes(req.file.path);
      } catch (validationErr: any) {
        return res.status(400).json({ message: validationErr.message });
      }
      const user = req.user!;
      if (user.profilePhoto) {
        const oldPath = path.join(process.cwd(), user.profilePhoto.replace(/^\//, ""));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      const photoPath = `/uploads/${req.file.filename}`;
      const updated = await storage.updateUser(user.id, { profilePhoto: photoPath });
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
      if (user.profilePhoto) {
        const oldPath = path.join(process.cwd(), user.profilePhoto.replace(/^\//, ""));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      const updated = await storage.updateUser(user.id, { profilePhoto: null });
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

  app.get("/api/photos/:filename", requireAuth, (req, res) => {
    const { filename } = req.params;
    if (!VALID_PHOTO_FILENAME.test(filename)) {
      return res.status(400).json({ message: "Nom de fichier invalide" });
    }
    const filePath = path.join(process.cwd(), "uploads", filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Photo non trouvée" });
    }
    const ext = path.extname(filename).toLowerCase().slice(1);
    res.setHeader("Content-Type", PHOTO_CONTENT_TYPES[ext] || "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Content-Disposition", "inline");
    res.sendFile(filePath);
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
      const junior = await storage.getUser(req.params.juniorId);
      if (!junior || junior.role !== "JUNIOR") {
        return res.status(404).json({ message: "Jeune non trouvé" });
      }
      const favorite = await storage.addFavorite(user.id, req.params.juniorId);
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
      await storage.removeFavorite(user.id, req.params.juniorId);
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
      const owns = notifications.some((n) => n.id === req.params.id);
      if (!owns) {
        return res.status(403).json({ message: "Accès refusé" });
      }
      const notification = await storage.markNotificationRead(req.params.id);
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
          subject: `FEVES - Nouvelle demande de validation d'inscription de ${userName}`,
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
      }));
      res.json(sanitized);
    } catch (err) {
      console.error("[RELATIONS] Error:", err);
      res.status(500).json({ message: "Erreur lors du chargement des relations" });
    }
  });

  app.get("/api/relations/:id", requireAuth, async (req, res) => {
    try {
      const relation = await storage.getRelationWithUsers(req.params.id);
      if (!relation) {
        return res.status(404).json({ message: "Relation non trouvée" });
      }
      const userId = req.user!.id;
      if (relation.seniorId !== userId && relation.juniorId !== userId && req.user!.role !== "ADMIN") {
        return res.status(403).json({ message: "Accès refusé" });
      }
      res.json({
        ...relation,
        senior: sanitizeUserPublic(relation.senior),
        junior: sanitizeUserPublic(relation.junior),
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
      const relation = await storage.getRelation(req.params.id);
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
          subject: `FEVES - Votre demande de relation a été acceptée`,
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
      const relation = await storage.getRelation(req.params.id);
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
      const relation = await storage.getRelation(req.params.id);
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
      const relation = await storage.getRelationWithUsers(req.params.relationId);
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
        relationId: req.params.relationId,
      });
      if (!parsed.success) {
        return res.status(400).json({
          message: "Données invalides",
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const intervention = await storage.createIntervention({
        relationId: parsed.data.relationId,
        scheduledDate: new Date(parsed.data.scheduledDate),
        durationMinutes: parsed.data.durationMinutes,
        location: parsed.data.location,
        tasks: parsed.data.tasks,
      });

      await storage.createNotification({
        user: { connect: { id: relation.juniorId } },
        type: "INTERVENTION_PROPOSED",
        title: "Nouvelle intervention proposée",
        message: `Une intervention a été proposée pour le ${new Date(parsed.data.scheduledDate).toLocaleDateString("fr-FR")}.`,
        link: `/relations/${relation.id}`,
      });

      const junior = await storage.getUser(relation.juniorId);
      if (junior?.email) {
        const juniorName = `${junior.firstName} ${junior.lastName}`;
        const dateStr = new Date(parsed.data.scheduledDate).toLocaleDateString("fr-FR");
        const locationStr = parsed.data.location || "Non précisé";
        sendEmail({
          to: junior.email,
          subject: `FEVES - Nouvelle intervention proposée pour le ${dateStr}`,
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
      const intervention = await storage.getInterventionWithRelation(req.params.id);
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
        message: `${req.user!.firstName} ${req.user!.lastName} a confirmé l'intervention du ${intervention.scheduledDate.toLocaleDateString("fr-FR")}.`,
        link: `/relations/${intervention.relationId}`,
      });

      const senior = await storage.getUser(intervention.relation.seniorId);
      if (senior?.email) {
        const seniorName = `${senior.firstName} ${senior.lastName}`;
        const dateStr = intervention.scheduledDate.toLocaleDateString("fr-FR");
        sendEmail({
          to: senior.email,
          subject: `FEVES - Intervention confirmée pour le ${dateStr}`,
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
      const intervention = await storage.getInterventionWithRelation(req.params.id);
      if (!intervention) {
        return res.status(404).json({ message: "Intervention non trouvée" });
      }
      if (intervention.status !== "CONFIRMED") {
        return res.status(400).json({ message: "L'intervention doit être confirmée avant d'être marquée comme réalisée" });
      }

      const updated = await storage.updateIntervention(intervention.id, { status: "COMPLETED_PENDING_FEEDBACK" });

      if (intervention.relation.status === "PENDING_FIRST_MEETING") {
        await storage.updateRelationStatus(intervention.relationId, "ACTIVE");
        await storage.getOrCreateConversation(intervention.relationId);
      }

      const seniorId = intervention.relation.seniorId;
      const juniorId = intervention.relation.juniorId;

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

      const dateStr = intervention.scheduledDate.toLocaleDateString("fr-FR");
      const seniorUser = await storage.getUser(seniorId);
      if (seniorUser?.email) {
        sendEmail({
          to: seniorUser.email,
          subject: `FEVES - Donnez votre avis sur l'intervention du ${dateStr}`,
          htmlContent: getFeedbackReminderEmailHtml(`${seniorUser.firstName} ${seniorUser.lastName}`, dateStr, `${getBaseUrl(req)}/relations/${intervention.relationId}`),
        }).catch(console.error);
      }
      const juniorUser = await storage.getUser(juniorId);
      if (juniorUser?.email) {
        sendEmail({
          to: juniorUser.email,
          subject: `FEVES - Donnez votre avis sur l'intervention du ${dateStr}`,
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
      const intervention = await storage.getInterventionWithRelation(req.params.id);
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
        message: `L'intervention du ${intervention.scheduledDate.toLocaleDateString("fr-FR")} a été annulée.`,
        link: `/relations/${intervention.relationId}`,
      });

      res.json(updated);
    } catch (err) {
      console.error("[CANCEL_INTERVENTION] Error:", err);
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
      res.json(needsFeedback);
    } catch (err) {
      console.error("[PENDING_FEEDBACK] Error:", err);
      res.status(500).json({ message: "Erreur" });
    }
  });

  app.post("/api/interventions/:id/feedback", requireAuth, async (req, res) => {
    try {
      const intervention = await storage.getInterventionWithRelation(req.params.id);
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

      res.json(updated);
    } catch (err) {
      console.error("[FEEDBACK] Error:", err);
      res.status(500).json({ message: "Erreur lors de l'enregistrement du feedback" });
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
      await storage.deleteAdminRecommendation(req.params.id);
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
      const user = await storage.getUser(req.params.id);
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
      const user = await storage.getUser(req.params.id);
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
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });
      if (user.role === "ADMIN") return res.status(403).json({ message: "Impossible de supprimer un administrateur" });
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
      const relation = await storage.getRelation(req.params.id);
      if (!relation) return res.status(404).json({ message: "Relation non trouvée" });
      if (relation.status !== "PENDING") {
        return res.status(400).json({ message: "Seules les relations en attente peuvent être avancées" });
      }
      const updated = await storage.updateRelationStatus(relation.id, "PENDING_FIRST_MEETING");

      await storage.createNotification({
        user: { connect: { id: relation.seniorId } },
        type: "RELATION_REQUEST",
        title: "Demande acceptée",
        message: "Un administrateur FEVES a validé l'accord du jeune. La première rencontre va être organisée.",
        link: `/relations/${relation.id}`,
      });
      await storage.createNotification({
        user: { connect: { id: relation.juniorId } },
        type: "RELATION_REQUEST",
        title: "Relation confirmée",
        message: "Un administrateur FEVES a confirmé votre participation. La première rencontre va être organisée.",
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
      const payment = await storage.createPayment({
        userId: parsed.data.userId,
        amount: parsed.data.amount,
        label: parsed.data.label,
        date: parsed.data.date ? new Date(parsed.data.date) : undefined,
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
      const relationId = req.params.id as string;
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

      const relationId = req.params.id as string;
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
      const relationId = req.params.id as string;
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
        where: { id: req.params.id },
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
          where: { relationId: req.params.id },
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
      const message = await storage.deleteMessage(req.params.messageId);
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
          subject: "Nouveau signalement reçu - FEVES",
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
      const report = await storage.updateReportStatus(req.params.id, "HANDLED", handledNote.trim());
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

      const intervention = await storage.createIntervention({
        relationId: parsed.data.relationId,
        scheduledDate: new Date(parsed.data.scheduledDate),
        durationMinutes: parsed.data.durationMinutes,
        location: parsed.data.location,
        tasks: parsed.data.tasks,
      });

      const referentUser = req.user as any;
      const senderName = `${referentUser.firstName} ${referentUser.lastName} (référent de ${relation.senior.firstName} ${relation.senior.lastName})`;
      await storage.createNotification({
        user: { connect: { id: relation.juniorId } },
        type: "INTERVENTION_PROPOSED",
        title: "Nouvelle intervention proposée",
        message: `${senderName} propose une intervention le ${new Date(parsed.data.scheduledDate).toLocaleDateString("fr-FR")}.`,
        link: null,
      });
      sendSSEEvent(relation.juniorId, "invalidate", { queryKey: ["/api/relations"] });

      res.status(201).json(intervention);
    } catch (err) {
      console.error("[REFERENT_INTERVENTION] Error:", err);
      res.status(500).json({ message: "Erreur lors de la création de l'intervention" });
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
          subject: `FEVES — Message du référent sénior ${senderName} : ${subject}`,
          htmlContent: `<h2 style="color:#8b5cf6">Message du référent sénior</h2><p><strong>De :</strong> ${senderName} (${user.email})</p><p><strong>Sujet :</strong> ${subject}</p><hr><p>${message.replace(/\n/g, "<br>")}</p><hr><p><a href="${baseUrl}/admin">Voir dans l'espace admin</a></p>`,
        }).catch(console.error);
      }

      res.json({ message: "Votre message a été envoyé à l'équipe FEVES." });
    } catch (err) {
      console.error("[REFERENT_CONTACT] Error:", err);
      res.status(500).json({ message: "Erreur lors de l'envoi du message" });
    }
  });

  return httpServer;
}
