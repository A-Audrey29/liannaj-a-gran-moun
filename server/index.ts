import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth } from "./auth";
import { checkAndSendFeedbackReminders } from "./lib/feedback-reminder";

const app = express();
const httpServer = createServer(app);

// Render (comme la plupart des PaaS) place l'app derrière un reverse proxy qui
// termine le TLS et réécrit l'IP source. Sans "trust proxy", Express ignore les
// en-têtes X-Forwarded-* : req.protocol reste "http" (→ le cookie de session
// `secure` n'est jamais posé → login cassé en prod) et req.ip vaut l'IP du proxy
// (→ le rate limiter partage un seul seau entre tous les clients).
// Valeur `1` = on ne fait confiance qu'à UN seul hop (le proxy Render). `true`
// ferait confiance à tout X-Forwarded-For, spoofable → contournement du rate limit.
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

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
    contentSecurityPolicy: process.env.NODE_ENV === "production"
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
    hsts: process.env.NODE_ENV === "production"
      ? { maxAge: 31536000, includeSubDomains: true }
      : false,
    referrerPolicy: { policy: "no-referrer" },
    xContentTypeOptions: true,
    xFrameOptions: process.env.NODE_ENV === "production"
      ? { action: "deny" }
      : false,
  }),
);

setupAuth(app);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

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
      if (capturedJsonResponse && process.env.NODE_ENV !== "production") {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
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

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
      setInterval(checkAndSendFeedbackReminders, 6 * 60 * 60 * 1000);
      checkAndSendFeedbackReminders();
    },
  );
})();
