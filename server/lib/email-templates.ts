import { PLATFORM_NAME, PLATFORM_TAGLINE, PLATFORM_ATTRIBUTION } from "../../shared/branding";

/**
 * Every value inserted into an email goes through this: names, comments and
 * messages are typed by users, and an unescaped `<a href=...>` in a first name
 * would become a working link inside a Lyannaj-branded email (phishing).
 */
export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getValidationEmailHtml(
  validatorName: string | null,
  userName: string,
  validationUrl: string,
  /** Senior registration: the validator is the trusted person (aidant). */
  forAidant = false
): string {
  const roleLabel = forAidant
    ? "personne de confiance (son aidant)"
    : "r&eacute;f&eacute;rent(e)";
  const aidantParagraph = forAidant
    ? `<p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
                En validant, vous pourrez aussi cr&eacute;er votre <strong>espace aidant</strong>&nbsp;: suivre ses rencontres, demander un atelier pour lui ou elle, payer ses forfaits et &eacute;crire &agrave; l'&eacute;quipe.
              </p>`
    : "";
  const greeting = validatorName
    ? `Bonjour ${escapeHtml(validatorName)},`
    : "Bonjour,";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Validation d'inscription ${PLATFORM_NAME}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f4fc;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f4fc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#e91e8c,#7c3aed);padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:1px;">${PLATFORM_NAME}</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${PLATFORM_TAGLINE}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">${greeting}</p>
              <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
                Une nouvelle inscription est en attente de votre validation.
              </p>
              <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
                <strong>${escapeHtml(userName)}</strong> souhaite rejoindre ${PLATFORM_NAME} et vous a d&eacute;sign&eacute;(e) comme ${roleLabel}.
              </p>
              ${aidantParagraph}
              <p style="margin:0 0 24px;color:#1f1f1f;font-size:15px;line-height:1.6;">
                Cliquez sur le bouton ci-dessous pour valider son inscription&nbsp;:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td align="center" style="border-radius:6px;background:linear-gradient(135deg,#e91e8c,#7c3aed);">
                    <a href="${escapeHtml(validationUrl)}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
                      Valider l'inscription
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 18px;color:#6b7280;font-size:13px;line-height:1.5;">
                Si le bouton ne fonctionne pas, copiez-collez le lien suivant dans votre navigateur&nbsp;:
              </p>
              <p style="margin:0 0 24px;word-break:break-all;color:#7c3aed;font-size:13px;line-height:1.5;">
                ${escapeHtml(validationUrl)}
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-top:1px solid #e5e7eb;">
                <tr><td style="height:18px;"></td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
                Cet email a &eacute;t&eacute; envoy&eacute; automatiquement par la plateforme ${PLATFORM_NAME}.<br />
                ${PLATFORM_ATTRIBUTION}<br />
                Si vous n'&ecirc;tes pas concern&eacute;(e), veuillez ignorer ce message.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function emailWrapper(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f4fc;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f4fc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#e91e8c,#7c3aed);padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:1px;">${PLATFORM_NAME}</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${PLATFORM_TAGLINE}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${bodyContent}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
                Cet email a &eacute;t&eacute; envoy&eacute; automatiquement par la plateforme ${PLATFORM_NAME}.<br />
                ${PLATFORM_ATTRIBUTION}<br />
                Si vous n'&ecirc;tes pas concern&eacute;(e), veuillez ignorer ce message.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function getRelationAcceptedEmailHtml(
  seniorName: string,
  juniorName: string,
  relationUrl: string
): string {
  const body = `
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">Bonjour ${escapeHtml(seniorName)},</p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Bonne nouvelle ! Votre demande de relation avec <strong>${escapeHtml(juniorName)}</strong> a &eacute;t&eacute; accept&eacute;e.
    </p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Vous pouvez d&egrave;s maintenant planifier des rencontres ensemble sur la plateforme ${PLATFORM_NAME}.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="border-radius:6px;background:linear-gradient(135deg,#e91e8c,#7c3aed);">
          <a href="${escapeHtml(relationUrl)}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
            Voir ma relation
          </a>
        </td>
      </tr>
    </table>`;
  return emailWrapper(`Relation accept\u00e9e - ${PLATFORM_NAME}`, body);
}

export function getInterventionProposedEmailHtml(
  userName: string,
  date: string,
  location: string,
  relationUrl: string
): string {
  const body = `
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">Bonjour ${escapeHtml(userName)},</p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Une nouvelle rencontre vous a &eacute;t&eacute; propos&eacute;e :
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:#f8f4fc;border-radius:6px;padding:16px;">
      <tr>
        <td style="padding:8px 16px;">
          <p style="margin:0 0 8px;color:#7c3aed;font-size:13px;font-weight:600;text-transform:uppercase;">Date</p>
          <p style="margin:0;color:#1f1f1f;font-size:15px;font-weight:600;">${escapeHtml(date)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 16px;">
          <p style="margin:0 0 8px;color:#7c3aed;font-size:13px;font-weight:600;text-transform:uppercase;">Lieu</p>
          <p style="margin:0;color:#1f1f1f;font-size:15px;font-weight:600;">${escapeHtml(location)}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Connectez-vous pour confirmer cette rencontre. En cas d'emp&ecirc;chement, &eacute;crivez &agrave; l'&eacute;quipe depuis le bouton Aide de votre espace.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="border-radius:6px;background:linear-gradient(135deg,#e91e8c,#7c3aed);">
          <a href="${escapeHtml(relationUrl)}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
            Voir la rencontre
          </a>
        </td>
      </tr>
    </table>`;
  return emailWrapper(`Nouvelle rencontre propos\u00e9e - ${PLATFORM_NAME}`, body);
}

export function getInterventionConfirmedEmailHtml(
  userName: string,
  date: string,
  relationUrl: string
): string {
  const body = `
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">Bonjour ${escapeHtml(userName)},</p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      La rencontre pr&eacute;vue le <strong>${escapeHtml(date)}</strong> a &eacute;t&eacute; confirm&eacute;e.
    </p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Tout est en ordre ! Rendez-vous le jour J.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="border-radius:6px;background:linear-gradient(135deg,#e91e8c,#7c3aed);">
          <a href="${escapeHtml(relationUrl)}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
            Voir les d&eacute;tails
          </a>
        </td>
      </tr>
    </table>`;
  return emailWrapper(`Rencontre confirm\u00e9e - ${PLATFORM_NAME}`, body);
}

export function getNegativeCreditBalanceEmailHtml(
  userName: string,
  seniorName: string,
  balance: number
): string {
  const body = `
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">Bonjour ${escapeHtml(userName)},</p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Le solde de cr&eacute;dits de <strong>${escapeHtml(seniorName)}</strong> est n&eacute;gatif
      (<strong>${balance}</strong>) suite &agrave; une rencontre r&eacute;alis&eacute;e.
    </p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Un rattrapage est n&eacute;cessaire pour continuer &agrave; organiser de nouvelles
      rencontres. Aucune nouvelle rencontre ne pourra &ecirc;tre propos&eacute;e tant que
      le solde n'est pas r&eacute;gularis&eacute;.
    </p>`;
  return emailWrapper(`Solde de crédits négatif - ${PLATFORM_NAME}`, body);
}

export function getCreditPurchaseConfirmedEmailHtml(
  userName: string,
  offerLabel: string,
  newBalance: number
): string {
  const body = `
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">Bonjour ${escapeHtml(userName)},</p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Votre achat <strong>${escapeHtml(offerLabel)}</strong> a &eacute;t&eacute; confirm&eacute;.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:#f8f4fc;border-radius:6px;">
      <tr>
        <td style="padding:16px;color:#1f1f1f;font-size:15px;">
          Nouveau solde : <strong>${newBalance} cr&eacute;dit${newBalance > 1 ? "s" : ""}</strong>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Merci de votre confiance !
    </p>`;
  return emailWrapper(`Confirmation d'achat - ${PLATFORM_NAME}`, body);
}

export function getFeedbackReminderEmailHtml(
  userName: string,
  interventionDate: string,
  feedbackUrl?: string
): string {
  const body = `
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">Bonjour ${escapeHtml(userName)},</p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      La rencontre du <strong>${escapeHtml(interventionDate)}</strong> s'est termin&eacute;e il y a quelques jours.
    </p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Votre avis est pr&eacute;cieux ! Prenez quelques instants pour laisser un retour sur cette exp&eacute;rience.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="border-radius:6px;background:linear-gradient(135deg,#e91e8c,#7c3aed);">
          <a href="${escapeHtml(feedbackUrl || '#')}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
            Donner mon avis
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 18px;color:#6b7280;font-size:13px;line-height:1.5;">
      Ce retour aide &agrave; am&eacute;liorer la qualit&eacute; des &eacute;changes sur la plateforme ${PLATFORM_NAME}.
    </p>`;
  return emailWrapper(`Rappel : donnez votre avis - ${PLATFORM_NAME}`, body);
}

/** Relance des admins : rencontres terminées depuis plus de 24h, jamais clôturées. */
export function getMeetingCheckAdminEmailHtml(
  adminName: string,
  meetings: { date: string; seniorName: string; juniorName: string }[],
  adminUrl: string
): string {
  const rows = meetings
    .map(
      (m) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#1f1f1f;font-size:14px;">${escapeHtml(m.date)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#1f1f1f;font-size:14px;">${escapeHtml(m.seniorName)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#1f1f1f;font-size:14px;">${escapeHtml(m.juniorName)}</td>
      </tr>`
    )
    .join("");
  const body = `
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">Bonjour ${escapeHtml(adminName)},</p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Ces rencontres sont termin&eacute;es depuis plus de 24h mais n&rsquo;ont pas &eacute;t&eacute; cl&ocirc;tur&eacute;es.
      Merci de v&eacute;rifier avec les participants puis de les marquer <strong>r&eacute;alis&eacute;es</strong>
      (le cr&eacute;dit est alors d&eacute;compt&eacute; et le feedback demand&eacute;) ou <strong>annul&eacute;es</strong>.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-collapse:collapse;">
      <tr>
        <th align="left" style="padding:8px 12px;color:#7c3aed;font-size:12px;text-transform:uppercase;">Date</th>
        <th align="left" style="padding:8px 12px;color:#7c3aed;font-size:12px;text-transform:uppercase;">S&eacute;nior</th>
        <th align="left" style="padding:8px 12px;color:#7c3aed;font-size:12px;text-transform:uppercase;">Jeune</th>
      </tr>${rows}
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="border-radius:6px;background:linear-gradient(135deg,#e91e8c,#7c3aed);">
          <a href="${escapeHtml(adminUrl)}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
            Cl&ocirc;turer les rencontres
          </a>
        </td>
      </tr>
    </table>`;
  return emailWrapper(`Rencontres à clôturer - ${PLATFORM_NAME}`, body);
}

export function getNewReportEmailHtml(
  adminName: string,
  reporterName: string,
  reason: string,
  message: string | null,
  adminUrl?: string
): string {
  const reasonLabels: Record<string, string> = {
    PERSON: "Problème avec une personne",
    QUESTION: "Question sur l'application",
    OTHER: "Autre chose",
  };
  const reasonLabel = reasonLabels[reason] ?? reason;
  const messageSection = message
    ? `<p style="margin:0 0 8px;color:#7c3aed;font-size:13px;font-weight:600;text-transform:uppercase;">Message</p>
       <p style="margin:0;color:#1f1f1f;font-size:15px;font-style:italic;">"${escapeHtml(message)}"</p>`
    : "";
  const body = `
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">Bonjour ${escapeHtml(adminName)},</p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Un utilisateur vient d&rsquo;envoyer un signalement via l&rsquo;onglet Aide.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:#fff4f4;border-left:4px solid #dc4256;border-radius:6px;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px;color:#dc4256;font-size:13px;font-weight:600;text-transform:uppercase;">Expéditeur</p>
          <p style="margin:0 0 16px;color:#1f1f1f;font-size:15px;font-weight:600;">${escapeHtml(reporterName)}</p>
          <p style="margin:0 0 8px;color:#dc4256;font-size:13px;font-weight:600;text-transform:uppercase;">Type</p>
          <p style="margin:0 0 16px;color:#1f1f1f;font-size:15px;">${escapeHtml(reasonLabel)}</p>
          ${messageSection}
        </td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="border-radius:6px;background:linear-gradient(135deg,#dc4256,#8b5cf6);">
          <a href="${escapeHtml(adminUrl || '#')}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
            Voir les signalements
          </a>
        </td>
      </tr>
    </table>`;
  return emailWrapper(`Nouveau signalement - ${PLATFORM_NAME}`, body);
}

export function getNewAdminNotificationEmailHtml(
  adminName: string,
  userName: string,
  eventDescription: string,
  adminUrl?: string
): string {
  const body = `
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">Bonjour ${escapeHtml(adminName)},</p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Un nouvel &eacute;v&eacute;nement n&eacute;cessite votre attention :
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:#f8f4fc;border-radius:6px;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px;color:#7c3aed;font-size:13px;font-weight:600;text-transform:uppercase;">Utilisateur</p>
          <p style="margin:0 0 16px;color:#1f1f1f;font-size:15px;font-weight:600;">${escapeHtml(userName)}</p>
          <p style="margin:0 0 8px;color:#7c3aed;font-size:13px;font-weight:600;text-transform:uppercase;">&Eacute;v&eacute;nement</p>
          <p style="margin:0;color:#1f1f1f;font-size:15px;">${escapeHtml(eventDescription)}</p>
        </td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="border-radius:6px;background:linear-gradient(135deg,#e91e8c,#7c3aed);">
          <a href="${escapeHtml(adminUrl || '#')}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
            Acc&eacute;der au tableau de bord
          </a>
        </td>
      </tr>
    </table>`;
  return emailWrapper(`Notification admin - ${PLATFORM_NAME}`, body);
}

/** Lien "mot de passe oublié", valable 1 heure. */
export function getPasswordResetEmailHtml(userName: string, resetUrl: string): string {
  const body = `
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">Bonjour ${escapeHtml(userName)},</p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Vous avez demand&eacute; &agrave; changer votre mot de passe ${PLATFORM_NAME}. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="border-radius:6px;background:linear-gradient(135deg,#e91e8c,#7c3aed);">
          <a href="${escapeHtml(resetUrl)}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
            Choisir un nouveau mot de passe
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 18px;color:#6b7280;font-size:13px;line-height:1.5;">
      Ce lien est valable 1 heure et ne peut servir qu'une fois. Si vous n'&ecirc;tes pas &agrave; l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste inchang&eacute;.
    </p>
    <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;word-break:break-all;">
      ${escapeHtml(resetUrl)}
    </p>`;
  return emailWrapper(`Nouveau mot de passe - ${PLATFORM_NAME}`, body);
}
