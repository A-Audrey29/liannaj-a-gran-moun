/**
 * Echappement HTML des e-mails.
 *
 * Prenoms, commentaires et messages sont saisis par les utilisateurs. Sans
 * echappement, `<a href="https://phish">` dans un prenom devient un vrai lien
 * dans un e-mail signe Lyannaj envoye a quelqu'un d'autre (hameconnage).
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("../server/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(null),
}));

import { resetDatabase, createUser, loginAs } from "./helpers";
import { prisma } from "../server/prisma";
import { sendEmail } from "../server/lib/email";
import * as templates from "../server/lib/email-templates";

const PIEGE = `<a href="https://phish.example">Cliquez</a>"'&`;
const LIEN_ACTIF = `<a href="https://phish.example">`;

function sansBaliseInjectee(html: string) {
  expect(html).not.toContain(LIEN_ACTIF);
  expect(html).toContain("&lt;a href=&quot;https://phish.example&quot;&gt;");
}

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(sendEmail).mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("escapeHtml", () => {
  it("neutralise les cinq caracteres speciaux HTML", () => {
    expect(templates.escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("accepte null, undefined et les nombres", () => {
    expect(templates.escapeHtml(null)).toBe("");
    expect(templates.escapeHtml(undefined)).toBe("");
    expect(templates.escapeHtml(3)).toBe("3");
  });
});

describe("chaque modele echappe ce qu'il insere", () => {
  const cas: [string, () => string][] = [
    ["validation", () => templates.getValidationEmailHtml(PIEGE, PIEGE, PIEGE)],
    ["relation acceptee", () => templates.getRelationAcceptedEmailHtml(PIEGE, PIEGE, PIEGE)],
    ["intervention proposee", () => templates.getInterventionProposedEmailHtml(PIEGE, PIEGE, PIEGE, PIEGE)],
    ["intervention confirmee", () => templates.getInterventionConfirmedEmailHtml(PIEGE, PIEGE, PIEGE)],
    ["solde negatif", () => templates.getNegativeCreditBalanceEmailHtml(PIEGE, PIEGE, -1)],
    ["achat confirme", () => templates.getCreditPurchaseConfirmedEmailHtml(PIEGE, PIEGE, 5)],
    ["rappel feedback", () => templates.getFeedbackReminderEmailHtml(PIEGE, PIEGE, PIEGE)],
    ["signalement", () => templates.getNewReportEmailHtml(PIEGE, PIEGE, "OTHER", PIEGE, PIEGE)],
    ["notification admin", () => templates.getNewAdminNotificationEmailHtml(PIEGE, PIEGE, PIEGE, PIEGE)],
  ];

  it.each(cas)("%s", (_nom, rendre) => {
    sansBaliseInjectee(rendre());
  });
});

describe("e-mail construit dans une route", () => {
  it("le message d'un referent a l'admin est echappe", async () => {
    const senior = await createUser("SENIOR");
    await createUser("ADMIN");
    const referent = await createUser("REFERENT_SENIOR", { linkedSeniorId: senior.id, firstName: PIEGE });

    const res = await (await loginAs(referent))
      .post("/api/referent/contact-admin")
      .send({ subject: PIEGE, message: `Bonjour ${PIEGE}\nsuite` });

    expect(res.status).toBeLessThan(300);
    const html = vi.mocked(sendEmail).mock.calls.map(([arg]) => arg.htmlContent).join("\n");
    expect(html.length).toBeGreaterThan(0);
    sansBaliseInjectee(html);
    // Les retours a la ligne restent rendus.
    expect(html).toContain("<br>suite");
  });
});
