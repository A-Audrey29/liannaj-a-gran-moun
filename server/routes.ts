import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import { requireAuth, requireAdmin } from "./auth";
import { storage } from "./storage";
import { sendEmail } from "./lib/email";
import {
  getValidationEmailHtml,
  getRelationAcceptedEmailHtml,
  getInterventionProposedEmailHtml,
  getInterventionConfirmedEmailHtml,
  getFeedbackReminderEmailHtml,
} from "./lib/email-templates";
import { insertUserSchema, createRelationSchema, insertInterventionSchema, feedbackSchema, createPaymentSchema, changePasswordSchema, createAdminSchema } from "../shared/schema";

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

function getBaseUrl(req: any): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5000";
  return `${proto}://${host}`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = insertUserSchema.safeParse(req.body);
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

      const hashedPassword = await bcrypt.hash(data.password, 10);
      const validationToken = crypto.randomUUID();

      const { categoryIds, birthDate, ...userData } = data;

      const user = await storage.createUser({
        ...userData,
        email: userData.email.toLowerCase().trim(),
        password: hashedPassword,
        birthDate: birthDate ? new Date(birthDate) : null,
        status: "PENDING_VALIDATION",
        role: userData.role,
        validationToken,
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

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", async (err: any, user: Express.User | false, info: { message: string }) => {
      if (err) {
        return res.status(500).json({ message: "Erreur interne" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Identifiants incorrects" });
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

  app.get("/api/validate", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) {
        return res.redirect("/validation-error?reason=invalid");
      }

      const user = await storage.getUserByValidationToken(token);
      if (!user) {
        return res.redirect("/validation-error?reason=invalid");
      }

      await storage.updateUser(user.id, {
        status: "ACTIVE",
        validationToken: null,
      });

      return res.redirect("/validation-success");
    } catch (err) {
      return res.redirect("/validation-error?reason=invalid");
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
        user: sanitizeUser(s.user),
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
        senior: sanitizeUser(r.senior),
        junior: sanitizeUser(r.junior),
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
        senior: sanitizeUser(relation.senior),
        junior: sanitizeUser(relation.junior),
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
      const updated = await storage.updateUser(user.id, { status: "ACTIVE", validationToken: null });
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

  return httpServer;
}
