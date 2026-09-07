import { PLATFORM_NAME } from "../../shared/branding";

export async function sendEmail({
  to,
  subject,
  htmlContent,
}: {
  to: string;
  subject: string;
  htmlContent: string;
}) {
  const apiKey = process.env.BREVO_API_KEY;
  // Ces valeurs par défaut ne servent qu'en développement : server/env.ts
  // impose que le trio BREVO_* soit fourni en entier ou pas du tout.
  const senderEmail = process.env.BREVO_SENDER_EMAIL || "noreply@lyannaj.fr";
  const senderName = process.env.BREVO_SENDER_NAME || PLATFORM_NAME;

  if (!apiKey) {
    console.warn("[BREVO] BREVO_API_KEY non configurée - email non envoyé:", {
      to,
      subject,
    });
    return null;
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(`Brevo error (${response.status}): ${error.message || JSON.stringify(error)}`);
  }

  return response.json();
}
