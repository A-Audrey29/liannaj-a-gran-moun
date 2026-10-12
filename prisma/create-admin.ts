/**
 * Création du compte administrateur initial.
 *
 * Contrairement à prisma/seed.ts, ce script est ADDITIF : il ne supprime
 * jamais rien. C'est le seul script destiné à être exécuté en production.
 *
 * Usage :
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_FIRST_NAME=... ADMIN_LAST_NAME=... \
 *     npx tsx prisma/create-admin.ts
 *
 * Si le compte existe déjà, le mot de passe est mis à jour et le compte est
 * réactivé (utile pour une réinitialisation), mais aucune autre donnée n'est
 * touchée. Le script est donc rejouable sans risque.
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const MIN_PASSWORD_LENGTH = 12;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(
      `\n[CREATE-ADMIN] Variable ${name} manquante.\n\n` +
        `Usage :\n` +
        `  ADMIN_EMAIL=admin@exemple.fr \\\n` +
        `  ADMIN_PASSWORD='<mot de passe fort>' \\\n` +
        `  ADMIN_FIRST_NAME=Prenom \\\n` +
        `  ADMIN_LAST_NAME=Nom \\\n` +
        `    npx tsx prisma/create-admin.ts\n`
    );
    process.exit(1);
  }
  return value.trim();
}

async function main() {
  const email = requireEnv("ADMIN_EMAIL").toLowerCase();
  const password = requireEnv("ADMIN_PASSWORD");
  const firstName = requireEnv("ADMIN_FIRST_NAME");
  const lastName = requireEnv("ADMIN_LAST_NAME");

  // Ce compte a tous les droits sur des données de mineurs : on impose un
  // minimum plus strict que les 6 caractères du formulaire d'inscription.
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `\n[CREATE-ADMIN] Mot de passe trop court ` +
        `(${password.length} caractères, minimum ${MIN_PASSWORD_LENGTH}).\n` +
        `Ce compte est administrateur : utilisez un mot de passe long et unique.\n`
    );
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({ where: { email } });

  const admin = await prisma.user.upsert({
    where: { email },
    // Compte déjà présent : on réinitialise l'accès sans écraser l'identité
    // ni les données liées (relations, rencontres, messages).
    update: {
      password: hashedPassword,
      role: "ADMIN",
      status: "ACTIVE",
    },
    create: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: "ADMIN",
      status: "ACTIVE",
    },
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  const action = existing ? "mis à jour" : "créé";
  console.log(
    `[CREATE-ADMIN] Compte administrateur ${action} : ` +
      `${admin.firstName} ${admin.lastName} <${admin.email}>`
  );

  const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
  console.log(`[CREATE-ADMIN] Administrateurs actifs en base : ${adminCount}`);
}

main()
  .catch((err) => {
    console.error("[CREATE-ADMIN] Échec :", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
