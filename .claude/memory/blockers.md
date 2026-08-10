# Blocages en cours — FEVES

## sendEmail lance une exception au lieu d'échouer silencieusement

**Fichier :** `server/lib/email.ts:39`

**Symptôme :** si `BREVO_API_KEY` absente ou invalide, `sendEmail` throw une erreur
(`Brevo error (401): Key not found`) au lieu de logger et continuer. Toute route qui
appelle `sendEmail` sans try/catch autour de cet appel spécifique plante en 500 — même
si le reste de l'opération (ex: création du compte) a réussi.

**Repro :** `POST /api/auth/register` en dev sans `BREVO_API_KEY` valide → user créé en
base, mais réponse 500 "Erreur lors de l'inscription" (l'email de validation ne part
jamais, mais le compte existe).

**Décision :** pas corrigé maintenant — reporté à la tâche "branchement des notifications
par mails", où toute la gestion d'envoi sera revue de toute façon.

**Piste pour plus tard :** `sendEmail` devrait catch en interne et logger un warning
(comme le fait déjà `server/index.ts` pour VAPID/push quand les clés manquent), plutôt
que de laisser l'exception remonter jusqu'à la route appelante.
