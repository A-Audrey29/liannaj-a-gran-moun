/**
 * Inscription quand l'e-mail de validation ne part pas.
 *
 * Le compte est cree avant l'envoi : repondre "erreur" ferait croire a un
 * echec, et une nouvelle tentative tomberait sur "adresse deja utilisee".
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { resetDatabase, anonymousAgent } from "./helpers";
import { prisma } from "../server/prisma";

const sendEmail = vi.fn();
vi.mock("../server/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));

const inscription = {
  email: "lucienne@test.local",
  password: "secret123",
  firstName: "Lucienne",
  lastName: "Test",
  role: "SENIOR",
  trustedPersonName: "Marie Proche",
  trustedPersonEmail: "marie@test.local",
  validatorEmail: "marie@test.local",
};

beforeEach(async () => {
  await resetDatabase();
  sendEmail.mockReset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/auth/register et envoi de l'e-mail de validation", () => {
  it("confirme l'inscription meme si l'e-mail echoue, en le signalant", async () => {
    sendEmail.mockRejectedValue(new Error("Brevo error (401): Key not found"));
    const res = await (await anonymousAgent()).post("/api/auth/register").send(inscription);
    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(false);
    const cree = await prisma.user.findUnique({ where: { email: "lucienne@test.local" } });
    expect(cree?.status).toBe("PENDING_VALIDATION");
  });

  it("cas normal : e-mail envoye a la personne de confiance", async () => {
    sendEmail.mockResolvedValue({});
    const res = await (await anonymousAgent()).post("/api/auth/register").send(inscription);
    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "marie@test.local" }));
  });
});
