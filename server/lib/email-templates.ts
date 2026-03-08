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
              <p style="margin:0;color:#ef4444;font-size:13px;line-height:1.5;font-weight:600;">
                Ce lien est valable 24 heures. Pass&eacute; ce d&eacute;lai, l'utilisateur devra demander un nouveau lien de validation.
              </p>
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
