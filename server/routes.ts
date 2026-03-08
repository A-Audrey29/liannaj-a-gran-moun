import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { requireAuth, requireAdmin } from "./auth";
import { storage } from "./storage";
import { sendEmail } from "./lib/email";
import { getValidationEmailHtml } from "./lib/email-templates";
import { insertUserSchema } from "../shared/schema";

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
      const validationUrl = `${baseUrl}/validate?token=${validationToken}`;
      const userName = `${user.firstName} ${user.lastName}`;

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
    passport.authenticate("local", (err: any, user: Express.User | false, info: { message: string }) => {
      if (err) {
        return res.status(500).json({ message: "Erreur interne" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Identifiants incorrects" });
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          return res.status(500).json({ message: "Erreur de session" });
        }
        return res.json({ user });
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
        const validationUrl = `${baseUrl}/validate?token=${newToken}`;

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

  return httpServer;
}
