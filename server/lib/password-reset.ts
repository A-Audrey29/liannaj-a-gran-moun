import crypto from "crypto";
import { prisma } from "../prisma";
import { pool } from "../db";

/**
 * Réinitialisation de mot de passe par lien e-mail ("mot de passe oublié").
 *
 * Règles de sécurité :
 * - jeton aléatoire de 256 bits, seule son empreinte SHA-256 est en base ;
 * - valable 1 heure, à usage unique ;
 * - une nouvelle demande annule les liens précédents de la personne ;
 * - après réinitialisation, toutes les sessions ouvertes sont fermées (si le
 *   mot de passe a fuité, l'intrus connecté est déconnecté).
 */

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Crée un jeton pour l'utilisateur et renvoie sa valeur en clair (pour le lien). */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    }),
  ]);
  return token;
}

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" };

/**
 * Consomme le jeton et remplace le mot de passe (déjà haché par l'appelant).
 *
 * La consommation est un updateMany conditionnel : de deux soumissions
 * simultanées du même lien, une seule passe.
 */
export async function resetPasswordWithToken(
  token: string,
  passwordHash: string
): Promise<ResetPasswordResult> {
  const tokenHash = hashToken(token);

  const outcome = await prisma.$transaction(async (tx): Promise<
    { error: "invalid" | "expired" } | { userId: string }
  > => {
    const record = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt) return { error: "invalid" };
    if (record.expiresAt.getTime() <= Date.now()) return { error: "expired" };

    const { count } = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) return { error: "invalid" };

    await tx.user.update({ where: { id: record.userId }, data: { password: passwordHash } });
    await tx.passwordResetToken.deleteMany({
      where: { userId: record.userId, id: { not: record.id } },
    });
    return { userId: record.userId };
  });

  if ("error" in outcome) return { ok: false, reason: outcome.error };

  // Sessions stockées par connect-pg-simple : { passport: { user: "<id>" } }.
  await pool.query(`DELETE FROM "session" WHERE sess->'passport'->>'user' = $1`, [
    outcome.userId,
  ]);
  return { ok: true };
}
