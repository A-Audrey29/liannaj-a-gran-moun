/**
 * Construction de l'application Express.
 *
 * Separe de server/index.ts pour que les tests puissent monter l'app en
 * memoire (via supertest) sans ouvrir de port ni demarrer le cron de rappel.
 * index.ts ne garde que ce qui releve du demarrage d'un vrai serveur :
 * listen(), le cron, et le service des fichiers statiques.
 */
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import type { Server } from "http";
import { registerRoutes } from "./routes";
import { setupAuth } from "./auth";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

/**
 * Monte middlewares, authentification et routes sur une app Express.
 *
 * `httpServer` est requis par registerRoutes (les SSE en ont besoin) ; en test
 * on passe un serveur non demarre, ce qui suffit.
 */
export async function createApp(httpServer: Server): Promise<Express> {
  const app = express();
  const isProduction = process.env.NODE_ENV === "production";

  // Render (comme la plupart des PaaS) place l'app derrière un reverse proxy qui
  // termine le TLS et réécrit l'IP source. Sans "trust proxy", Express ignore les
  // en-têtes X-Forwarded-* : req.protocol reste "http" (→ le cookie de session
  // `secure` n'est jamais posé → login cassé en prod) et req.ip vaut l'IP du proxy
  // (→ le rate limiter partage un seul seau entre tous les clients).
  // Valeur `1` = on ne fait confiance qu'à UN seul hop (le proxy Render). `true`
  // ferait confiance à tout X-Forwarded-For, spoofable → contournement du rate limit.
  app.set("trust proxy", 1);

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));

  // En-têtes de sécurité HTTP via Helmet.
  // Trois directives sont limitées à la production (NODE_ENV === "production") :
  //   - contentSecurityPolicy : désactivée en dev car Vite hot-reload injecte des scripts inline
  //   - hsts : inutile en dev (pas de HTTPS local)
  //   - xFrameOptions : désactivée en dev car tout IDE/prévisualisation locale
  //     (Replit, VS Code Live Preview, etc.) affiche l'app dans un iframe.
  //     En production (Render), l'app n'est jamais dans un iframe → DENY protège du clickjacking.
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:"],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameSrc: ["'none'"],
            },
          }
        : false,
      hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
      referrerPolicy: { policy: "no-referrer" },
      xContentTypeOptions: true,
      xFrameOptions: isProduction ? { action: "deny" } : false,
    }),
  );

  setupAuth(app);

  // Journal des requêtes API. Le corps de la réponse n'est jamais loggué en
  // production : il contient des données personnelles (e-mails, noms).
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse && process.env.NODE_ENV === "development") {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        log(logLine);
      }
    });

    next();
  });

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  return app;
}
