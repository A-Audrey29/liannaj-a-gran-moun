/**
 * Validation des variables d'environnement au démarrage.
 *
 * Sans ce module, une variable manquante ne se voyait qu'à l'usage, et
 * silencieusement : BASE_URL absente produisait des liens "/admin" sans
 * domaine dans les e-mails, et le rappel de feedback retombait sur
 * http://localhost:5000 — des liens morts envoyés à de vrais utilisateurs,
 * sans la moindre erreur dans les logs.
 *
 * Principe : échouer au démarrage, avec un message qui dit quoi corriger.
 * Un service qui ne démarre pas est un incident visible ; un service qui
 * envoie des liens cassés pendant trois semaines ne l'est pas.
 *
 * Ce module est importé en première ligne de server/index.ts, avant tout
 * autre import applicatif.
 */
import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Groupe de variables optionnel mais indissociable : soit tout est fourni et
 * la fonctionnalité est active, soit rien ne l'est et elle est désactivée.
 * Une configuration partielle est presque toujours un oubli — on la refuse
 * plutôt que de la laisser dégrader en silence.
 */
function allOrNothing(names: string[], featureLabel: string): string[] {
  const provided = names.filter((n) => !!process.env[n]?.trim());
  if (provided.length === 0 || provided.length === names.length) return [];
  const missing = names.filter((n) => !process.env[n]?.trim());
  return [
    `${featureLabel} : configuration incomplète. ` +
      `Fourni : ${provided.join(", ")}. Manquant : ${missing.join(", ")}. ` +
      `Renseignez toutes ces variables, ou aucune pour désactiver la fonctionnalité.`,
  ];
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL est requise (URL de connexion PostgreSQL)")
    .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
      message: "DATABASE_URL doit commencer par postgres:// ou postgresql://",
    }),

  // 32 caractères minimum : en dessous, le secret de session devient
  // attaquable hors ligne à partir d'un cookie intercepté.
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET doit faire au moins 32 caractères. Générer : node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""),

  // Obligatoire en production uniquement : en développement, l'URL est
  // dérivée de la requête, ce qui suffit sur localhost.
  BASE_URL: isProduction
    ? z
        .string()
        .url("BASE_URL doit être une URL absolue, ex. https://lyannaj.fr")
        .refine((v) => !v.endsWith("/"), {
          message: "BASE_URL ne doit pas finir par '/' (les liens sont construits avec un / initial)",
        })
    : z.string().url().optional(),

  PORT: z.coerce.number().int().positive().default(5000),

  BREVO_API_KEY: z.string().optional(),
  BREVO_SENDER_EMAIL: z.string().email("BREVO_SENDER_EMAIL doit être une adresse e-mail valide").optional(),
  BREVO_SENDER_NAME: z.string().optional(),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z
    .string()
    .refine((v) => v.startsWith("mailto:") || v.startsWith("https://"), {
      message: "VAPID_SUBJECT doit commencer par 'mailto:' ou 'https://' (exigence de la spéc. Web Push)",
    })
    .optional(),

  STRIPE_SECRET_KEY: z.string().startsWith("sk_", "STRIPE_SECRET_KEY doit commencer par sk_").optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_", "STRIPE_WEBHOOK_SECRET doit commencer par whsec_").optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_", "STRIPE_PUBLISHABLE_KEY doit commencer par pk_").optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  const errors: string[] = [];

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join(".") || "(racine)"} : ${issue.message}`);
    }
  }

  errors.push(
    ...allOrNothing(
      ["BREVO_API_KEY", "BREVO_SENDER_EMAIL", "BREVO_SENDER_NAME"],
      "E-mails transactionnels (Brevo)"
    )
  );
  errors.push(
    ...allOrNothing(
      ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
      "Notifications push (VAPID)"
    )
  );
  errors.push(
    ...allOrNothing(
      ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PUBLISHABLE_KEY"],
      "Paiement en ligne (Stripe)"
    )
  );

  if (errors.length > 0) {
    console.error(
      `\n[ENV] Configuration invalide — démarrage interrompu.\n\n` +
        errors.map((e) => `  • ${e}`).join("\n") +
        `\n\nVoir .env.example pour la liste complète des variables.\n`
    );
    process.exit(1);
  }

  const env = parsed.data!;

  // En production, une fonctionnalité désactivée est un choix qui doit être
  // conscient : on le signale sans bloquer le démarrage.
  if (isProduction) {
    if (!env.BREVO_API_KEY) {
      console.warn(
        "[ENV] Brevo non configuré : aucun e-mail ne sera envoyé " +
          "(validation d'inscription, rappels de feedback)."
      );
    }
    if (!env.VAPID_PUBLIC_KEY) {
      console.warn("[ENV] VAPID non configuré : les notifications push sont désactivées.");
    }
    if (!env.STRIPE_SECRET_KEY) {
      console.warn("[ENV] Stripe non configuré : l'achat de crédits en ligne est désactivé.");
    }
  }

  return env;
}

export const env = loadEnv();

/**
 * URL publique de l'application. En production, BASE_URL est garantie par la
 * validation ci-dessus. En développement, on retombe sur localhost.
 */
export function getBaseUrl(): string {
  return env.BASE_URL ?? `http://localhost:${env.PORT}`;
}
