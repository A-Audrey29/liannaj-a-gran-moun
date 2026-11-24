/**
 * Security fixes before go-live (2026-11-04 audit).
 *
 * - A suspended / deleted account loses its open sessions at once, not when
 *   its 7-day cookie expires.
 * - Changing the password logs the other devices out.
 * - Links in e-mails come from BASE_URL, never from a header the sender of the
 *   request controls (X-Forwarded-Host, Host).
 * - Routes that send e-mails or messages are rate limited.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("../server/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(null),
}));

import { resetDatabase, createUser, loginAs, createRelation, MOT_DE_PASSE_TEST } from "./helpers";
import { prisma } from "../server/prisma";
import { sendEmail } from "../server/lib/email";

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(sendEmail).mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("compte suspendu ou supprimé", () => {
  it("la suspension par l'admin coupe la session ouverte", async () => {
    const admin = await createUser("ADMIN");
    const junior = await createUser("JUNIOR");
    const agentJunior = await loginAs(junior);
    expect((await agentJunior.get("/api/auth/me")).status).toBe(200);

    const agentAdmin = await loginAs(admin);
    expect((await agentAdmin.patch(`/api/admin/users/${junior.id}/suspend`).send({})).status).toBe(200);

    expect((await agentJunior.get("/api/auth/me")).status).toBe(401);
    expect((await agentJunior.get("/api/relations")).status).toBe(401);
  });

  it("un statut non actif en base suffit à refuser la session (même sans passer par la route)", async () => {
    const senior = await createUser("SENIOR");
    const agent = await loginAs(senior);

    await prisma.user.update({ where: { id: senior.id }, data: { status: "BANNED" } });

    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("la suppression du compte coupe la session ouverte", async () => {
    const admin = await createUser("ADMIN");
    const senior = await createUser("SENIOR");
    const agentSenior = await loginAs(senior);

    const agentAdmin = await loginAs(admin);
    expect((await agentAdmin.delete(`/api/admin/users/${senior.id}`)).status).toBe(200);

    expect((await agentSenior.get("/api/auth/me")).status).toBe(401);
  });
});

describe("changement de mot de passe", () => {
  it("déconnecte les autres appareils et garde l'appareil courant", async () => {
    const senior = await createUser("SENIOR");
    const telephone = await loginAs(senior);
    const ordinateur = await loginAs(senior);

    const res = await ordinateur
      .patch("/api/auth/me/password")
      .send({ currentPassword: MOT_DE_PASSE_TEST, newPassword: "NouveauMotDePasse456!" });
    expect(res.status).toBe(200);

    expect((await ordinateur.get("/api/auth/me")).status).toBe(200);
    expect((await telephone.get("/api/auth/me")).status).toBe(401);
  });
});

describe("liens dans les e-mails", () => {
  it("ignorent X-Forwarded-Host et Host : toujours BASE_URL", async () => {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const relation = await createRelation(senior.id, junior.id, "PENDING");
    const agentJunior = await loginAs(junior);

    const res = await agentJunior
      .patch(`/api/relations/${relation.id}/accept`)
      .set("X-Forwarded-Host", "site-pirate.example")
      .set("X-Forwarded-Proto", "https")
      .send({});
    expect(res.status).toBe(200);

    // The accept e-mail is sent without await: let it be queued.
    await vi.waitFor(() => expect(vi.mocked(sendEmail)).toHaveBeenCalled());
    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.to).toBe(senior.email);
    expect(mail.htmlContent).not.toContain("site-pirate.example");
    expect(mail.htmlContent).toContain(`${process.env.BASE_URL}/relations/${relation.id}`);
  });

  it("le renvoi du lien de validation ignore aussi l'en-tête Host", async () => {
    const junior = await createUser("JUNIOR", {
      status: "PENDING_VALIDATION",
      validatorEmail: "prof@lycee.example",
    });
    const { anonymousAgent } = await import("./helpers");
    const agent = await anonymousAgent();

    await agent
      .post("/api/auth/resend-validation")
      .set("Host", "site-pirate.example")
      .send({ email: junior.email });

    const mail = vi.mocked(sendEmail).mock.calls[0][0];
    expect(mail.htmlContent).not.toContain("site-pirate.example");
    expect(mail.htmlContent).toContain(`${process.env.BASE_URL}/api/validate?token=`);
  });
});

describe("limites de débit", () => {
  // In tests the ceiling is high (isDev): we check the limiter is mounted
  // through its standard headers, as tests/auth.test.ts does for login.
  it("renvoi du lien de validation", async () => {
    const { anonymousAgent } = await import("./helpers");
    const agent = await anonymousAgent();
    const res = await agent.post("/api/auth/resend-validation").send({ email: "x@test.local" });
    expect(res.headers).toHaveProperty("ratelimit-limit");
  });

  it("signalements", async () => {
    const senior = await createUser("SENIOR");
    const agent = await loginAs(senior);
    const res = await agent.post("/api/reports").send({ reason: "QUESTION", message: "Bonjour" });
    expect(res.status).toBe(201);
    expect(res.headers).toHaveProperty("ratelimit-limit");
  });

  it("messages", async () => {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const relation = await createRelation(senior.id, junior.id, "ACTIVE");
    const agent = await loginAs(senior);
    const res = await agent.post(`/api/messages/conversations/${relation.id}`).send({ content: "Bonjour" });
    expect(res.status).toBe(201);
    expect(res.headers).toHaveProperty("ratelimit-limit");
  });

  it("un limit démesuré sur la page de messages ne casse pas la route", async () => {
    const senior = await createUser("SENIOR");
    const junior = await createUser("JUNIOR");
    const relation = await createRelation(senior.id, junior.id, "ACTIVE");
    const agent = await loginAs(senior);
    for (let i = 0; i < 3; i++) {
      await agent.post(`/api/messages/conversations/${relation.id}`).send({ content: `m${i}` });
    }
    const res = await agent.get(`/api/messages/conversations/${relation.id}?limit=1000000`);
    expect(res.status).toBe(200);
    expect(res.body.messages.length).toBe(3);
  });
});

describe("flux temps réel (SSE) à la suspension", () => {
  it("la suspension ferme le flux déjà ouvert du compte, pas celui des autres", async () => {
    const { addSSEClient, isUserConnected } = await import("../server/lib/sse");
    const admin = await createUser("ADMIN");
    const junior = await createUser("JUNIOR");
    const other = await createUser("SENIOR");

    // Fake open streams: only end() and on() are used by the SSE module.
    const fakeStream = () => ({ end: vi.fn(), on: vi.fn(), write: vi.fn() });
    const juniorStream = fakeStream();
    const otherStream = fakeStream();
    addSSEClient(junior.id, juniorStream as any);
    addSSEClient(other.id, otherStream as any);

    const agentAdmin = await loginAs(admin);
    expect((await agentAdmin.patch(`/api/admin/users/${junior.id}/suspend`).send({})).status).toBe(200);

    expect(juniorStream.end).toHaveBeenCalled();
    expect(isUserConnected(junior.id)).toBe(false);
    expect(otherStream.end).not.toHaveBeenCalled();
    expect(isUserConnected(other.id)).toBe(true);
  });
});
