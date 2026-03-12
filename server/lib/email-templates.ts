export function getValidationEmailHtml(
  validatorName: string | null,
  userName: string,
  validationUrl: string
): string {
  const greeting = validatorName
    ? `Bonjour ${validatorName},`
    : "Bonjour,";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Validation d'inscription FEVES</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f4fc;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f4fc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#e91e8c,#7c3aed);padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:1px;">FEVES</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Favoriser les Echanges et la Valorisation Entre les Seniors</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">${greeting}</p>
              <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
                Une nouvelle inscription est en attente de votre validation.
              </p>
              <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
                <strong>${userName}</strong> souhaite rejoindre FEVES et vous a d&eacute;sign&eacute;(e) comme r&eacute;f&eacute;rent(e).
              </p>
              <p style="margin:0 0 24px;color:#1f1f1f;font-size:15px;line-height:1.6;">
                Cliquez sur le bouton ci-dessous pour valider son inscription&nbsp;:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>
                  <td align="center" style="border-radius:6px;background:linear-gradient(135deg,#e91e8c,#7c3aed);">
                    <a href="${validationUrl}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
                      Valider l'inscription
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 18px;color:#6b7280;font-size:13px;line-height:1.5;">
                Si le bouton ne fonctionne pas, copiez-collez le lien suivant dans votre navigateur&nbsp;:
              </p>
              <p style="margin:0 0 24px;word-break:break-all;color:#7c3aed;font-size:13px;line-height:1.5;">
                ${validationUrl}
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-top:1px solid #e5e7eb;">
                <tr><td style="height:18px;"></td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
                Cet email a &eacute;t&eacute; envoy&eacute; automatiquement par la plateforme FEVES.<br />
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
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f4fc;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f4fc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#e91e8c,#7c3aed);padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:1px;">FEVES</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Favoriser les Echanges et la Valorisation Entre les Seniors</p>
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
                Cet email a &eacute;t&eacute; envoy&eacute; automatiquement par la plateforme FEVES.<br />
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
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">Bonjour ${seniorName},</p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Bonne nouvelle ! Votre demande de relation avec <strong>${juniorName}</strong> a &eacute;t&eacute; accept&eacute;e.
    </p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Vous pouvez d&egrave;s maintenant planifier des interventions ensemble sur la plateforme FEVES.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="border-radius:6px;background:linear-gradient(135deg,#e91e8c,#7c3aed);">
          <a href="${relationUrl}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
            Voir ma relation
          </a>
        </td>
      </tr>
    </table>`;
  return emailWrapper("Relation accept\u00e9e - FEVES", body);
}

export function getInterventionProposedEmailHtml(
  userName: string,
  date: string,
  location: string,
  relationUrl: string
): string {
  const body = `
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">Bonjour ${userName},</p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Une nouvelle intervention vous a &eacute;t&eacute; propos&eacute;e :
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:#f8f4fc;border-radius:6px;padding:16px;">
      <tr>
        <td style="padding:8px 16px;">
          <p style="margin:0 0 8px;color:#7c3aed;font-size:13px;font-weight:600;text-transform:uppercase;">Date</p>
          <p style="margin:0;color:#1f1f1f;font-size:15px;font-weight:600;">${date}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 16px;">
          <p style="margin:0 0 8px;color:#7c3aed;font-size:13px;font-weight:600;text-transform:uppercase;">Lieu</p>
          <p style="margin:0;color:#1f1f1f;font-size:15px;font-weight:600;">${location}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Connectez-vous pour confirmer ou refuser cette intervention.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="border-radius:6px;background:linear-gradient(135deg,#e91e8c,#7c3aed);">
          <a href="${relationUrl}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
            Voir l'intervention
          </a>
        </td>
      </tr>
    </table>`;
  return emailWrapper("Nouvelle intervention propos\u00e9e - FEVES", body);
}

export function getInterventionConfirmedEmailHtml(
  userName: string,
  date: string,
  relationUrl: string
): string {
  const body = `
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">Bonjour ${userName},</p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      L'intervention pr&eacute;vue le <strong>${date}</strong> a &eacute;t&eacute; confirm&eacute;e.
    </p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Tout est en ordre ! Rendez-vous le jour J.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="border-radius:6px;background:linear-gradient(135deg,#e91e8c,#7c3aed);">
          <a href="${relationUrl}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
            Voir les d&eacute;tails
          </a>
        </td>
      </tr>
    </table>`;
  return emailWrapper("Intervention confirm\u00e9e - FEVES", body);
}

export function getFeedbackReminderEmailHtml(
  userName: string,
  interventionDate: string,
  feedbackUrl?: string
): string {
  const body = `
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">Bonjour ${userName},</p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      L'intervention du <strong>${interventionDate}</strong> s'est termin&eacute;e il y a quelques jours.
    </p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Votre avis est pr&eacute;cieux ! Prenez quelques instants pour laisser un retour sur cette exp&eacute;rience.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="border-radius:6px;background:linear-gradient(135deg,#e91e8c,#7c3aed);">
          <a href="${feedbackUrl || '#'}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
            Donner mon avis
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 18px;color:#6b7280;font-size:13px;line-height:1.5;">
      Ce retour aide &agrave; am&eacute;liorer la qualit&eacute; des &eacute;changes sur la plateforme FEVES.
    </p>`;
  return emailWrapper("Rappel : donnez votre avis - FEVES", body);
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
       <p style="margin:0;color:#1f1f1f;font-size:15px;font-style:italic;">"${message}"</p>`
    : "";
  const body = `
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">Bonjour ${adminName},</p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Un utilisateur vient d&rsquo;envoyer un signalement via l&rsquo;onglet Aide.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:#fff4f4;border-left:4px solid #dc4256;border-radius:6px;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px;color:#dc4256;font-size:13px;font-weight:600;text-transform:uppercase;">Expéditeur</p>
          <p style="margin:0 0 16px;color:#1f1f1f;font-size:15px;font-weight:600;">${reporterName}</p>
          <p style="margin:0 0 8px;color:#dc4256;font-size:13px;font-weight:600;text-transform:uppercase;">Type</p>
          <p style="margin:0 0 16px;color:#1f1f1f;font-size:15px;">${reasonLabel}</p>
          ${messageSection}
        </td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="border-radius:6px;background:linear-gradient(135deg,#dc4256,#8b5cf6);">
          <a href="${adminUrl || '#'}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
            Voir les signalements
          </a>
        </td>
      </tr>
    </table>`;
  return emailWrapper("Nouveau signalement - FEVES", body);
}

export function getNewAdminNotificationEmailHtml(
  adminName: string,
  userName: string,
  eventDescription: string,
  adminUrl?: string
): string {
  const body = `
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">Bonjour ${adminName},</p>
    <p style="margin:0 0 18px;color:#1f1f1f;font-size:15px;line-height:1.6;">
      Un nouvel &eacute;v&eacute;nement n&eacute;cessite votre attention :
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background-color:#f8f4fc;border-radius:6px;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px;color:#7c3aed;font-size:13px;font-weight:600;text-transform:uppercase;">Utilisateur</p>
          <p style="margin:0 0 16px;color:#1f1f1f;font-size:15px;font-weight:600;">${userName}</p>
          <p style="margin:0 0 8px;color:#7c3aed;font-size:13px;font-weight:600;text-transform:uppercase;">&Eacute;v&eacute;nement</p>
          <p style="margin:0;color:#1f1f1f;font-size:15px;">${eventDescription}</p>
        </td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
      <tr>
        <td align="center" style="border-radius:6px;background:linear-gradient(135deg,#e91e8c,#7c3aed);">
          <a href="${adminUrl || '#'}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
            Acc&eacute;der au tableau de bord
          </a>
        </td>
      </tr>
    </table>`;
  return emailWrapper("Notification admin - FEVES", body);
}
