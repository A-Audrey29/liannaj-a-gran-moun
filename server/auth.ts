import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { storage } from "./storage";
import type { Express, Request, Response, NextFunction } from "express";

const PgSession = connectPgSimple(session);

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      status: string;
      birthDate: Date | null;
      phone: string | null;
      address: string | null;
      city: string | null;
      postalCode: string | null;
      bio: string | null;
      desiredActivity: string | null;
      schoolName: string | null;
      referentTitle: string | null;
      referentFirstName: string | null;
      referentLastName: string | null;
      referentEmail: string | null;
      trustedPersonName: string | null;
      trustedPersonEmail: string | null;
      profilePhoto: string | null;
    }
  }
}

function mapUserToSession(user: any): Express.User {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    birthDate: user.birthDate,
    phone: user.phone,
    address: user.address,
    city: user.city,
    postalCode: user.postalCode,
    bio: user.bio,
    desiredActivity: user.desiredActivity,
    schoolName: user.schoolName,
    referentTitle: user.referentTitle,
    referentFirstName: user.referentFirstName,
    referentLastName: user.referentLastName,
    referentEmail: user.referentEmail,
    trustedPersonName: user.trustedPersonName,
    trustedPersonEmail: user.trustedPersonEmail,
    profilePhoto: user.profilePhoto,
  };
}

export function setupAuth(app: Express) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET environment variable is required");
  }

  app.use(
    session({
      store: new PgSession({
        pool: pool as any,
        tableName: "session",
        createTableIfMissing: true,
      }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email.toLowerCase().trim());

          if (!user) {
            return done(null, false, { message: "Email ou mot de passe incorrect" });
          }

          const isValid = await bcrypt.compare(password, user.password);
          if (!isValid) {
            return done(null, false, { message: "Email ou mot de passe incorrect" });
          }

          if (user.status !== "ACTIVE") {
            return done(null, false, {
              message: "Votre compte est en attente de validation par votre référent.",
            });
          }

          return done(null, mapUserToSession(user));
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      done(null, mapUserToSession(user));
    } catch (err) {
      done(err);
    }
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Non authentifié" });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Non authentifié" });
  }
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ message: "Accès réservé aux administrateurs" });
  }
  next();
}
