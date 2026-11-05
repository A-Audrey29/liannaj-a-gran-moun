/**
 * Inactivité des comptes (RGPD) : server/lib/inactivity.ts + shared/inactivity.ts.
 *
 * Un compte sans connexion depuis 2 ans reçoit UN e-mail ; 30 jours plus tard
 * il apparaît « à supprimer » pour l'admin. Rien n'est jamais supprimé
 * automatiquement.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("../server/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: "test" }),
}));

import { resetDatabase, createUser, loginAs } from "./helpers";
import { prisma } from "../server/prisma";
import { pool } from "../server/db";
import { sendEmail } from "../server/lib/email";
import { checkInactiveAccounts, listInactiveAccounts } from "../server/lib/inactivity";
import { inactivityStatus, INACTIVITY_GRACE_DAYS } from "../shared/inactivity";

const DAY = 24 * 60 * 60 * 1000;
const ilYaJours = (n: number) => new Date(Date.now() - n * DAY);
const TROIS_ANS = () => ilYaJours(3 * 365);

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(sendEmail).mockReset();
  vi.mocked(sendEmail).mockResolvedValue({ messageId: "test" } as never);
});

afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

describe("job d'avertissement", () => {
  it("avertit seulement les comptes actifs, non admin, inactifs depuis 2 ans", async () => {
    const vieux = await createUser("SENIOR", { createdAt: TROIS_ANS() });
    // Connexion récente malgré un compte ancien : pas concerné.
    await createUser("SENIOR", { createdAt: TROIS_ANS(), lastLoginAt: ilYaJours(10) });
    // Compte récent.
    await createUser("JUNIOR", { createdAt: ilYaJours(100) });
    // Pile en dessous du seuil.
    await createUser("SENIOR", { createdAt: ilYaJours(2 * 365 - 5) });
    // Exclus : admin, suspendu, banni, en attente.
    await createUser("ADMIN", { createdAt: TROIS_ANS() });
    await createUser("SENIOR", { createdAt: TROIS_ANS(), status: "SUSPENDED" });
    await createUser("SENIOR", { createdAt: TROIS_ANS(), status: "BANNED" });
    await createUser("SENIOR", { createdAt: TROIS_ANS(), status: "PENDING_VALIDATION" });

    const result = await checkInactiveAccounts();

    expect(result).toEqual({ warned: 1, failed: 0, skipped: false });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe(vieux.email);
    const html = vi.mocked(sendEmail).mock.calls[0][0].htmlContent;
    expect(html).toContain("http://localhost:5000/login");
    expect(html).toContain(`${INACTIVITY_GRACE_DAYS} jours`);

    const apres = await prisma.user.findUnique({ where: { id: vieux.id } });
    expect(apres?.inactivityWarnedAt).not.toBeNull();
    expect(await prisma.user.count({ where: { inactivityWarnedAt: { not: null } } })).toBe(1);
  });

  it("utilise lastLoginAt plutôt que createdAt quand il existe", async () => {
    const u = await createUser("SENIOR", { createdAt: TROIS_ANS(), lastLoginAt: TROIS_ANS() });
    await checkInactiveAccounts();
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe(u.email);
  });

  it("est idempotent : une deuxième passe n'envoie rien", async () => {
    await createUser("SENIOR", { createdAt: TROIS_ANS() });
    await checkInactiveAccounts();
    const second = await checkInactiveAccounts();
    expect(second.warned).toBe(0);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("un échec d'e-mail n'arrête pas la passe et ne marque pas le compte", async () => {
    const a = await createUser("SENIOR", { createdAt: TROIS_ANS() });
    const b = await createUser("JUNIOR", { createdAt: TROIS_ANS() });
    vi.mocked(sendEmail).mockImplementation(async ({ to }) => {
      if (to === a.email) throw new Error("Brevo down");
      return { messageId: "ok" } as never;
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await checkInactiveAccounts();

    expect(result).toMatchObject({ warned: 1, failed: 1 });
    expect((await prisma.user.findUnique({ where: { id: a.id } }))?.inactivityWarnedAt).toBeNull();
    expect((await prisma.user.findUnique({ where: { id: b.id } }))?.inactivityWarnedAt).not.toBeNull();

    // Au prochain passage, a est retenté.
    vi.mocked(sendEmail).mockResolvedValue({ messageId: "ok" } as never);
    expect((await checkInactiveAccounts()).warned).toBe(1);
    vi.restoreAllMocks();
  });

  it("ne marque pas le compte si aucun prestataire d'e-mail n'est configuré (sendEmail renvoie null)", async () => {
    const u = await createUser("SENIOR", { createdAt: TROIS_ANS() });
    vi.mocked(sendEmail).mockResolvedValue(null as never);
    const result = await checkInactiveAccounts();
    expect(result).toMatchObject({ warned: 0, failed: 1 });
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.inactivityWarnedAt).toBeNull();
  });

  it("ne supprime jamais rien, même après le délai de grâce", async () => {
    await createUser("SENIOR", {
      createdAt: TROIS_ANS(),
      inactivityWarnedAt: ilYaJours(INACTIVITY_GRACE_DAYS + 10),
    });
    await checkInactiveAccounts();
    expect(await prisma.user.count()).toBe(1);
  });
});

describe("foyer sénior + aidant", () => {
  it("la connexion récente de l'aidant protège le sénior (et inversement)", async () => {
    const senior = await createUser("SENIOR", { createdAt: TROIS_ANS() });
    await createUser("REFERENT_SENIOR", { createdAt: TROIS_ANS(), lastLoginAt: ilYaJours(10), linkedSeniorId: senior.id });
    const senior2 = await createUser("SENIOR", { createdAt: TROIS_ANS(), lastLoginAt: ilYaJours(10) });
    await createUser("REFERENT_SENIOR", { createdAt: TROIS_ANS(), linkedSeniorId: senior2.id });

    const result = await checkInactiveAccounts();

    expect(result.warned).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(await listInactiveAccounts()).toEqual([]);
  });

  it("un deuxième aidant actif protège aussi l'autre aidant", async () => {
    const senior = await createUser("SENIOR", { createdAt: TROIS_ANS() });
    await createUser("REFERENT_SENIOR", { createdAt: TROIS_ANS(), linkedSeniorId: senior.id });
    await createUser("REFERENT_SENIOR", { createdAt: TROIS_ANS(), lastLoginAt: ilYaJours(10), linkedSeniorId: senior.id });

    expect(await listInactiveAccounts()).toEqual([]);
  });

  it("foyer entièrement inactif : chaque compte est averti, l'e-mail nomme l'autre membre", async () => {
    const senior = await createUser("SENIOR", { createdAt: TROIS_ANS(), firstName: "René", lastName: "Moreau" });
    const aidant = await createUser("REFERENT_SENIOR", {
      createdAt: TROIS_ANS(),
      lastLoginAt: ilYaJours(2 * 365 + 30),
      firstName: "André",
      lastName: "Moreau",
      linkedSeniorId: senior.id,
    });

    const result = await checkInactiveAccounts();

    expect(result.warned).toBe(2);
    const mails = vi.mocked(sendEmail).mock.calls.map((c) => c[0]);
    expect(mails.find((m) => m.to === senior.email)?.htmlContent).toContain("André Moreau");
    expect(mails.find((m) => m.to === aidant.email)?.htmlContent).toContain("René Moreau");

    // L'admin voit d'où vient la date du sénior.
    const liste = await listInactiveAccounts();
    const ligneSenior = liste.find((a) => a.id === senior.id)!;
    expect(ligneSenior.activityVia).toEqual({ firstName: "André", lastName: "Moreau", role: "REFERENT_SENIOR" });
    expect(liste.find((a) => a.id === aidant.id)!.activityVia).toBeNull();
  });

  it("un sénior sans aidant : e-mail sans mention de foyer", async () => {
    const seul = await createUser("SENIOR", { createdAt: TROIS_ANS() });
    await checkInactiveAccounts();
    const html = vi.mocked(sendEmail).mock.calls[0][0].htmlContent;
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe(seul.email);
    expect(html).not.toContain("il suffit que l&rsquo;un de vous");
  });

  it("la connexion de l'aidant efface l'avertissement de tout le foyer", async () => {
    const senior = await createUser("SENIOR", { createdAt: TROIS_ANS(), inactivityWarnedAt: ilYaJours(40) });
    const aidant = await createUser("REFERENT_SENIOR", {
      createdAt: TROIS_ANS(),
      inactivityWarnedAt: ilYaJours(40),
      linkedSeniorId: senior.id,
    });
    const autre = await createUser("SENIOR", { createdAt: TROIS_ANS(), inactivityWarnedAt: ilYaJours(40) });

    await loginAs(aidant);

    const [s, a, o] = await Promise.all(
      [senior, aidant, autre].map((u) => prisma.user.findUnique({ where: { id: u.id } }))
    );
    expect(s?.inactivityWarnedAt).toBeNull();
    expect(a?.inactivityWarnedAt).toBeNull();
    expect(a?.lastLoginAt).not.toBeNull();
    expect(s?.lastLoginAt).toBeNull(); // la date du sénior n'est pas falsifiée
    expect(o?.inactivityWarnedAt).not.toBeNull(); // un autre foyer n'est pas touché
  });
});

describe("statut", () => {
  it("TO_WARN / WARNED / TO_DELETE selon la date d'avertissement", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    expect(inactivityStatus(null, now)).toBe("TO_WARN");
    expect(inactivityStatus(new Date(now.getTime() - 10 * DAY), now)).toBe("WARNED");
    expect(inactivityStatus(new Date(now.getTime() - (INACTIVITY_GRACE_DAYS * DAY - 1)), now)).toBe("WARNED");
    expect(inactivityStatus(new Date(now.getTime() - INACTIVITY_GRACE_DAYS * DAY), now)).toBe("TO_DELETE");
  });

  it("listInactiveAccounts met « à supprimer » en premier", async () => {
    await createUser("SENIOR", { createdAt: TROIS_ANS() });
    const averti = await createUser("SENIOR", { createdAt: TROIS_ANS(), inactivityWarnedAt: ilYaJours(5) });
    const echu = await createUser("JUNIOR", { createdAt: TROIS_ANS(), inactivityWarnedAt: ilYaJours(40) });

    const list = await listInactiveAccounts();

    expect(list.map((a) => a.status)).toEqual(["TO_DELETE", "WARNED", "TO_WARN"]);
    expect(list[0].id).toBe(echu.id);
    expect(list[1].id).toBe(averti.id);
    expect(list[0]).not.toHaveProperty("email");
  });
});

describe("connexion", () => {
  it("enregistre lastLoginAt et efface l'avertissement", async () => {
    const u = await createUser("SENIOR", { createdAt: TROIS_ANS(), inactivityWarnedAt: ilYaJours(5) });

    await loginAs(u);

    const apres = await prisma.user.findUnique({ where: { id: u.id } });
    expect(apres?.inactivityWarnedAt).toBeNull();
    expect(apres?.lastLoginAt).not.toBeNull();
    expect(Date.now() - apres!.lastLoginAt!.getTime()).toBeLessThan(60_000);
    expect(await listInactiveAccounts()).toHaveLength(0);
  });
});

describe("routes admin", () => {
  it("refuse un non-admin (403) et un anonyme (401)", async () => {
    const senior = await createUser("SENIOR");
    const agent = await loginAs(senior);
    expect((await agent.get("/api/admin/inactive-accounts")).status).toBe(403);
    expect((await agent.post("/api/admin/inactive-accounts/run")).status).toBe(403);

    const { anonymousAgent } = await import("./helpers");
    const anon = await anonymousAgent();
    expect((await anon.get("/api/admin/inactive-accounts")).status).toBe(401);
  });

  it("l'admin liste les comptes inactifs et peut lancer la vérification", async () => {
    const admin = await createUser("ADMIN");
    const inactif = await createUser("SENIOR", { createdAt: TROIS_ANS() });
    const agent = await loginAs(admin);

    const run = await agent.post("/api/admin/inactive-accounts/run");
    expect(run.status).toBe(200);
    expect(run.body).toEqual({ warned: 1, failed: 0, skipped: false });

    const res = await agent.get("/api/admin/inactive-accounts");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: inactif.id, role: "SENIOR", status: "WARNED" });
    expect(res.body[0].warnedAt).toBeTruthy();
    expect(res.body[0]).not.toHaveProperty("email");
  });
});
