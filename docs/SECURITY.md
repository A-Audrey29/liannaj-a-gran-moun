# Audit de sécurité — FEVES

Dernière mise à jour : mars 2026

---

## 1. Vue d'ensemble

FEVES est une application web de mise en relation entre seniors et jeunes en Guadeloupe. Elle gère des données personnelles sensibles (adresses, téléphones, personnes de confiance) et des photos de profil. Ce document recense toutes les mesures de sécurité en place avec des références précises au code source.

**Architecture de sécurité** :
- Authentification par sessions PostgreSQL (`server/auth.ts:72-89`)
- En-têtes HTTP durcis via Helmet (`server/index.ts:28-51`)
- Rate limiting sur les routes sensibles (`server/routes.ts:76-90`)
- Protection des fichiers uploadés via route authentifiée (`server/routes.ts:323-346`)
- Sanitization des données personnelles à deux niveaux (`server/routes.ts:51-74`)
- Validation systématique des entrées via Zod (`shared/schema.ts`)
- Hashing des mots de passe bcrypt facteur 10 (`server/routes.ts:138`)

**Signaler une vulnérabilité** : contacter l'administrateur du projet directement. Ne pas ouvrir d'issue publique.

---

## 2. En-têtes HTTP — Helmet

**Fichier** : `server/index.ts:28-51`

Le middleware Helmet v8.1.0 (`server/index.ts:2` import, `server/index.ts:28` usage) est appliqué globalement :

| En-tête | Configuration | Lignes |
|---|---|---|
| `Content-Security-Policy` | Production : `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:`, `connect-src 'self'`, `object-src 'none'`, `frame-src 'none'`. Désactivée en dev (Vite hot-reload) | `index.ts:30-43` |
| `Strict-Transport-Security` | Production uniquement : `max-age=31536000`, `includeSubDomains` | `index.ts:44-46` |
| `X-Content-Type-Options` | `nosniff` — toujours actif | `index.ts:48` |
| `X-Frame-Options` | Production : `DENY` — empêche le clickjacking. Désactivé en dev (tout IDE affiche l'app dans un iframe : Replit, VS Code Live Preview, etc.) | `index.ts:59-61` |
| `Referrer-Policy` | `no-referrer` — toujours actif | `index.ts:47` |

---

## 3. Rate limiting

**Fichier** : `server/routes.ts:76-90`

Deux limiteurs IP via `express-rate-limit` v8.3.1 (`routes.ts:9` import) :

| Route | Limite | Fenêtre | Définition | Application |
|---|---|---|---|---|
| `POST /api/auth/login` | 10 tentatives | 15 minutes | `routes.ts:76-82` | `routes.ts:185` |
| `POST /api/auth/register` | 5 inscriptions | 1 heure | `routes.ts:84-90` | `routes.ts:112` |

Configuration : `standardHeaders: true` (`routes.ts:80,88`), `legacyHeaders: false` (`routes.ts:81,89`).

---

## 4. Sessions et authentification

### 4.1 Configuration des sessions (`auth.ts:66-89`)

`SESSION_SECRET` est **obligatoire** — l'application lève une exception au démarrage si absente (`auth.ts:68-70`).

| Paramètre | Valeur | Ligne |
|---|---|---|
| Store | PostgreSQL via `connect-pg-simple` v10.0.0 | `auth.ts:10,74-78` |
| `createTableIfMissing` | `true` | `auth.ts:77` |
| `secret` | `process.env.SESSION_SECRET` | `auth.ts:79` |
| `resave` | `false` | `auth.ts:80` |
| `saveUninitialized` | `false` | `auth.ts:81` |
| `maxAge` | 7 jours (`7 * 24 * 60 * 60 * 1000`) | `auth.ts:83` |
| `httpOnly` | `true` | `auth.ts:84` |
| `secure` | `true` en production | `auth.ts:85` |
| `sameSite` | `"lax"` | `auth.ts:86` |

### 4.2 Hashing des mots de passe

Package `bcryptjs` v3.0.3 (`auth.ts:3` import). Facteur de coût **10** (`routes.ts:138` : `bcrypt.hash(data.password, 10)`). Comparaison via `bcrypt.compare` (`auth.ts:105`).

### 4.3 Protection contre la fixation de session (`routes.ts:193-199`)

À la connexion, la session est **régénérée** via `req.session.regenerate()` avant `req.logIn()`. Erreurs gérées par `try/catch` async/await, renvoi d'un 500 générique.

### 4.4 Stratégie d'authentification (`auth.ts:94-122`)

- Email normalisé `toLowerCase().trim()` (`auth.ts:99`)
- Comptes non-`ACTIVE` rejetés (`auth.ts:110-114`)
- Message identique pour email inconnu et mauvais mot de passe : `"Email ou mot de passe incorrect"` (`auth.ts:102,107`) — anti-énumération

### 4.5 Token de validation

- Génération : `crypto.randomUUID()` (`routes.ts:139`)
- Validation : le token est **effacé** en base après usage (`routes.ts:435` : `validationToken: null`) — empêche la réutilisation
- Renvoi : un nouveau token remplace l'ancien (`routes.ts:477-481`)

---

## 5. Protection des photos de profil

### 5.1 Upload sécurisé (`routes.ts:25-49, 92-99`)

| Protection | Détail | Ligne |
|---|---|---|
| Limite de taille | 5 Mo | `routes.ts:39` |
| Extensions autorisées | `.jpg`, `.jpeg`, `.png`, `.webp` | `routes.ts:41` |
| Nommage UUID | `crypto.randomUUID()` + extension | `routes.ts:33` |
| Magic bytes | `validateImageMagicBytes()` vérifie le MIME réel via `file-type` v21.3.1 (`routes.ts:10` import) | `routes.ts:92-99` |
| Rejet sécurisé | Fichier supprimé du disque + erreur 400 si magic bytes invalides | `routes.ts:96-97` |
| Double validation register | Extension par Multer (`routes.ts:40-48`) + magic bytes (`routes.ts:130-136`) | |
| Double validation photo update | Extension par Multer (`routes.ts:40-48`) + magic bytes (`routes.ts:281-285`) | |

### 5.2 Accès authentifié (`routes.ts:323-346`)

Aucun `express.static("uploads")` dans le code. Route `GET /api/photos/:filename` (`routes.ts:331`) :

| Protection | Détail | Ligne |
|---|---|---|
| Authentification | `requireAuth` | `routes.ts:331` |
| Anti path-traversal | Regex `^[a-f0-9-]{36}\.(jpg\|jpeg\|png\|webp)$` | `routes.ts:323,333` |
| `X-Content-Type-Options` | `nosniff` | `routes.ts:342` |
| `Cache-Control` | `private, max-age=3600` | `routes.ts:343` |
| `Content-Disposition` | `inline` | `routes.ts:344` |
| `Content-Type` | Map `PHOTO_CONTENT_TYPES` par extension | `routes.ts:324-329,341` |

**Frontend** : `client/src/lib/photo-url.ts:1-8` — `getPhotoUrl()` convertit `/uploads/xxx` en `/api/photos/xxx`.

### 5.3 Suppression des fichiers sur disque

| Action | Ligne |
|---|---|
| Suppression de photo | `routes.ts:307-309` |
| Remplacement de photo | `routes.ts:287-289` |
| Suppression de compte admin | `routes.ts:1081-1083` |
| Échec validation magic bytes | `routes.ts:96` |

---

## 6. Validation des entrées

### 6.1 Schémas Zod (`shared/schema.ts`)

| Schéma | Route | Contraintes | Ligne schéma | Ligne route |
|---|---|---|---|---|
| `insertUserSchema` | `POST /api/auth/register` | Email valide, password min 6 chars, `validatorEmail ≠ email` (anti auto-validation), domaines freemail bloqués pour validateurs Junior en production | `schema.ts:120-157` | `routes.ts:118-121` |
| `loginSchema` | `POST /api/auth/login` | Email valide, password min 6 chars | `schema.ts:94-97` | `auth.ts:96` |
| `changePasswordSchema` | `PATCH /api/auth/me/password` | Ancien et nouveau password min 6 chars | `schema.ts:212-215` | `routes.ts:258` |
| `updateProfileSchema` | `PATCH /api/auth/me` | Champs optionnels, bio max 500 chars | `schema.ts:176-194` | `routes.ts:238` |
| `createRelationSchema` | `POST /api/relations` | `juniorId` requis, non vide | `schema.ts:172-174` | `routes.ts:575` |
| `insertInterventionSchema` | `POST /api/relations/:id/interventions` | Date requise, durée 30-480 min, tasks array | `schema.ts:159-165` | `routes.ts:737` |
| `feedbackSchema` | `POST /api/interventions/:id/feedback` | Note 1-5, commentaire max 1000 chars | `schema.ts:167-170` | `routes.ts:964` |
| `createPaymentSchema` | `POST /api/admin/payments` | Montant positif, libellé requis | `schema.ts:205-210` | `routes.ts:1195` |
| `createAdminSchema` | `POST /api/admin/create-admin` | Email valide, password min 6 chars | `schema.ts:217-222` | `routes.ts:1166` |

### 6.2 Validations inline (hors Zod)

| Route | Contrainte | Ligne |
|---|---|---|
| `POST /api/messages/conversations/:id` | Contenu non vide, string, max 2000 caractères | `routes.ts:1282-1287` |
| `POST /api/auth/resend-validation` | Email requis, type string | `routes.ts:470-471` |
| `POST /api/push/subscribe` | `endpoint`, `keys.p256dh`, `keys.auth` requis | `routes.ts:1373-1374` |

### 6.3 Contraintes métier notables

| Contrainte | Détail | Ligne |
|---|---|---|
| Anti auto-validation | `validatorEmail` ne peut pas être égal à `email` | `schema.ts:148-149` |
| Domaines freemail bloqués | En production, le `validatorEmail` d'un Junior ne peut pas être un domaine freemail (Gmail, Yahoo, etc.) | `schema.ts:109-114,151-156` |
| Bio max 500 chars | Préprocesseur Zod, vide → undefined | `schema.ts:131-134` |

---

## 7. Matrice d'autorisations

### 7.1 Middlewares (`auth.ts:141-156`)

| Middleware | Vérifie | HTTP si échec | Ligne |
|---|---|---|---|
| `requireAuth` | `req.isAuthenticated()` | 401 | `auth.ts:141-146` |
| `requireAdmin` | `req.isAuthenticated()` ET `req.user.role === "ADMIN"` | 401 ou 403 | `auth.ts:148-156` |

### 7.2 Matrice complète

**Légende** : `●` autorisé, `○` interdit, `◐` conditionnel

#### Auth & Compte

| Route | Anonyme | Senior | Junior | Admin | Condition | Ligne |
|---|---|---|---|---|---|---|
| `POST /api/auth/register` | ● | ● | ● | ● | Rate limited 5/h | `routes.ts:112` |
| `POST /api/auth/login` | ● | ● | ● | ● | Rate limited 10/15min | `routes.ts:185` |
| `POST /api/auth/logout` | ● | ● | ● | ● | | `routes.ts:219` |
| `GET /api/auth/me` | ○ | ● | ● | ● | | `routes.ts:228` |
| `PATCH /api/auth/me` | ○ | ● | ● | ● | Profil propre | `routes.ts:235` |
| `PATCH /api/auth/me/password` | ○ | ● | ● | ● | Profil propre | `routes.ts:253` |
| `POST /api/auth/me/photo` | ○ | ● | ● | ● | Profil propre | `routes.ts:276` |
| `DELETE /api/auth/me/photo` | ○ | ● | ● | ● | Profil propre | `routes.ts:304` |
| `POST /api/auth/resend-validation` | ● | ● | ● | ● | Pas de rate limiting (voir M2) | `routes.ts:467` |
| `GET /api/validate` | ● | ● | ● | ● | Token effacé après usage (`routes.ts:435`) | `routes.ts:421` |
| `GET /api/photos/:filename` | ○ | ● | ● | ● | Regex anti path-traversal | `routes.ts:331` |

#### Catégories & Notifications

| Route | Anonyme | Senior | Junior | Admin | Condition | Ligne |
|---|---|---|---|---|---|---|
| `GET /api/categories` | ● | ● | ● | ● | Public (formulaire inscription) | `routes.ts:394` |
| `GET /api/notifications` | ○ | ● | ● | ● | Propres notifications | `routes.ts:412` |
| `GET /api/notifications/count` | ○ | ● | ● | ● | Propres notifications | `routes.ts:403` |
| `PATCH /api/notifications/:id/read` | ○ | ◐ | ◐ | ◐ | Propriétaire vérifié (`routes.ts:456`) | `routes.ts:453` |
| `PATCH /api/notifications/read-all` | ○ | ● | ● | ● | Propres notifications | `routes.ts:444` |

#### Favoris (Senior uniquement)

| Route | Anonyme | Senior | Junior | Admin | Condition | Ligne |
|---|---|---|---|---|---|---|
| `GET /api/favorites` | ○ | ● | ○ | ○ | Senior vérifié | `routes.ts:348` |
| `POST /api/favorites/:juniorId` | ○ | ● | ○ | ○ | Senior vérifié | `routes.ts:362` |
| `DELETE /api/favorites/:juniorId` | ○ | ● | ○ | ○ | Senior vérifié | `routes.ts:380` |

#### Matching & Relations

| Route | Anonyme | Senior | Junior | Admin | Condition | Ligne |
|---|---|---|---|---|---|---|
| `GET /api/matching/suggestions` | ○ | ● | ● | ○ | Admin exclu (`routes.ts:510`). Via `sanitizeUserPublic` (`routes.ts:518`) | `routes.ts:507` |
| `POST /api/relations` | ○ | ● | ○ | ○ | Senior uniquement (`routes.ts:571`) | `routes.ts:568` |
| `PATCH /api/relations/:id/accept` | ○ | ○ | ◐ | ○ | Junior destinataire (`routes.ts:618`) | `routes.ts:612` |
| `PATCH /api/relations/:id/reject` | ○ | ○ | ◐ | ○ | Junior destinataire (`routes.ts:659`) | `routes.ts:653` |
| `PATCH /api/relations/:id/close` | ○ | ◐ | ◐ | ● | Participant ou Admin (`routes.ts:690`) | `routes.ts:683` |
| `GET /api/relations` | ○ | ● | ● | ● | Propres relations | `routes.ts:532` |
| `GET /api/relations/:id` | ○ | ◐ | ◐ | ● | Participant ou Admin (`routes.ts:554`) | `routes.ts:547` |

#### Interventions

| Route | Anonyme | Senior | Junior | Admin | Condition | Ligne |
|---|---|---|---|---|---|---|
| `POST /api/relations/:id/interventions` | ○ | ◐ | ○ | ◐ | `PENDING_FIRST_MEETING` : Admin seul (`routes.ts:726`). `ACTIVE` : Senior ou Admin (`routes.ts:730`) | `routes.ts:717` |
| `PATCH /api/interventions/:id/confirm` | ○ | ○ | ◐ | ○ | Junior de la relation (`routes.ts:789`) | `routes.ts:783` |
| `PATCH /api/interventions/:id/done` | ○ | ○ | ○ | ● | Admin via `requireAdmin` | `routes.ts:824` |
| `PATCH /api/interventions/:id/cancel` | ○ | ◐ | ○ | ● | Senior ou Admin (`routes.ts:893`) | `routes.ts:885` |
| `GET /api/interventions/pending-feedback` | ○ | ● | ● | ● | Filtre propres interventions (`routes.ts:925-931`) | `routes.ts:923` |
| `POST /api/interventions/:id/feedback` | ○ | ◐ | ◐ | ○ | Participant (`routes.ts:953`), pas déjà noté (`routes.ts:957-961`) | `routes.ts:939` |

#### Messagerie

| Route | Anonyme | Senior | Junior | Admin | Condition | Ligne |
|---|---|---|---|---|---|---|
| `GET /api/messages/stream` (SSE) | ○ | ● | ● | ● | Connexion persistante, heartbeat 30s | `routes.ts:1216` |
| `GET /api/messages/unread-count` | ○ | ● | ● | ● | Propres messages | `routes.ts:1234` |
| `GET /api/messages/conversations` | ○ | ● | ● | ● | Propres conversations | `routes.ts:1244` |
| `GET /api/messages/conversations/:id` | ○ | ◐ | ◐ | ○ | Participant (`routes.ts:1261`) + relation ACTIVE (`routes.ts:1264`) | `routes.ts:1254` |
| `POST /api/messages/conversations/:id` | ○ | ◐ | ◐ | ○ | Participant (`routes.ts:1294`) + relation ACTIVE (`routes.ts:1297`) + contenu max 2000 chars (`routes.ts:1285`) | `routes.ts:1279` |
| `PATCH /api/messages/conversations/:id/read` | ○ | ◐ | ◐ | ○ | Participant vérifié | `routes.ts:1334` |

#### Push

| Route | Anonyme | Senior | Junior | Admin | Condition | Ligne |
|---|---|---|---|---|---|---|
| `GET /api/push/vapid-key` | ● | ● | ● | ● | Clé publique — par conception | `routes.ts:1365` |
| `POST /api/push/subscribe` | ○ | ● | ● | ● | | `routes.ts:1370` |

#### Administration

| Route | Anonyme | Senior | Junior | Admin | Condition | Ligne |
|---|---|---|---|---|---|---|
| `GET /api/admin/users` | ○ | ○ | ○ | ● | Via `sanitizeUser` (`routes.ts:1041`) | `routes.ts:1038` |
| `PATCH /api/admin/users/:id/validate` | ○ | ○ | ○ | ● | `PENDING_VALIDATION` uniquement (`routes.ts:1052`) | `routes.ts:1048` |
| `PATCH /api/admin/users/:id/suspend` | ○ | ○ | ○ | ● | Impossible sur ADMIN (`routes.ts:1067`) | `routes.ts:1063` |
| `DELETE /api/admin/users/:id` | ○ | ○ | ○ | ● | Impossible sur ADMIN (`routes.ts:1080`). Photo supprimée (`routes.ts:1081-1083`) | `routes.ts:1076` |
| `POST /api/admin/create-admin` | ○ | ○ | ○ | ● | Vérifie email unique (`routes.ts:1171`) | `routes.ts:1164` |
| `GET /api/admin/relations` | ○ | ○ | ○ | ● | Via `sanitizeUser` (`routes.ts:1098-1099`) | `routes.ts:1093` |
| `GET /api/admin/relations/pending-meeting` | ○ | ○ | ○ | ● | Via `sanitizeUser` (`routes.ts:1112-1113`) | `routes.ts:1107` |
| `GET /api/admin/interventions` | ○ | ○ | ○ | ● | Via `sanitizeUser` (`routes.ts:1128-1129`) | `routes.ts:1121` |
| `GET /api/admin/notifications` | ○ | ○ | ○ | ● | Via `sanitizeUser` (`routes.ts:1143`) | `routes.ts:1138` |
| `GET /api/admin/payments` | ○ | ○ | ○ | ● | Via `sanitizeUser` (`routes.ts:1156`) | `routes.ts:1151` |
| `POST /api/admin/payments` | ○ | ○ | ○ | ● | Zod `createPaymentSchema` (`routes.ts:1195`) | `routes.ts:1193` |
| `POST /api/admin/recommendations` | ○ | ○ | ○ | ● | | `routes.ts:1009` |
| `DELETE /api/admin/recommendations/:id` | ○ | ○ | ○ | ● | | `routes.ts:1026` |
| `GET /api/admin/messages/conversations` | ○ | ○ | ○ | ● | | `routes.ts:1386` |
| `GET /api/admin/messages/conversations/:id` | ○ | ○ | ○ | ● | Bypass IStorage — import direct Prisma (voir L5) | `routes.ts:1396` |
| `DELETE /api/admin/messages/:messageId` | ○ | ○ | ○ | ● | Soft delete (`isDeleted: true`) | `routes.ts:1448` |

---

## 8. Sanitization des données (RGPD)

**Fichier** : `server/routes.ts:51-74`

### 8.1 `sanitizeUser(user)` (`routes.ts:51-54`)

**Champs retirés** : `password`, `validationToken`, `validationExpiry`

**Routes utilisant `sanitizeUser`** :
| Route | Ligne |
|---|---|
| `POST /api/auth/me/photo` | `routes.ts:293` |
| `DELETE /api/auth/me/photo` | `routes.ts:312` |
| `GET /api/admin/users` | `routes.ts:1041` |
| `PATCH /api/admin/users/:id/validate` | `routes.ts:1056` |
| `PATCH /api/admin/users/:id/suspend` | `routes.ts:1069` |
| `GET /api/admin/relations` | `routes.ts:1098-1099` |
| `GET /api/admin/relations/pending-meeting` | `routes.ts:1112-1113` |
| `GET /api/admin/interventions` | `routes.ts:1128-1129` |
| `GET /api/admin/notifications` | `routes.ts:1143` |
| `GET /api/admin/payments` | `routes.ts:1156` |

### 8.2 `sanitizeUserPublic(user)` (`routes.ts:56-74`)

**Champs retirés en plus** : `phone`, `address`, `postalCode`, `trustedPersonName`, `trustedPersonEmail`, `referentEmail`, `referentTitle`, `referentFirstName`, `referentLastName`, `validatorEmail`

**Routes utilisant `sanitizeUserPublic`** :
| Route | Ligne |
|---|---|
| `GET /api/matching/suggestions` | `routes.ts:518` |
| `GET /api/relations` | `routes.ts:537-538` |
| `GET /api/relations/:id` | `routes.ts:559-560` |

Le champ `password` (hash bcrypt) n'apparaît dans **aucune** réponse API.

---

## 9. Logging et informations exposées

**Fichier** : `server/index.ts:66-90`

| Aspect | Détail | Ligne |
|---|---|---|
| Logs dev | Méthode, path, status, durée + body JSON | `index.ts:77-86` |
| Logs prod | Méthode, path, status, durée uniquement — corps non loggés | `index.ts:81` (`NODE_ENV !== "production"`) |
| Tokens dev | Liens de validation loggés en dev uniquement | `routes.ts:166-168`, `routes.ts:486-488` |
| Anti-énumération login | Message identique pour email inconnu et mauvais password | `auth.ts:102,107` |
| Anti-énumération resend | Toujours 200, même message si compte inexistant | `routes.ts:498,501` |
| Stack traces | Jamais envoyées au client | `index.ts:95-106` |
| Erreurs | Messages génériques côté client, détails via `console.error` serveur | |

---

## 10. Vulnérabilités résiduelles connues

### Sévérité MEDIUM

| ID | Description | Référence | Impact | Recommandation |
|---|---|---|---|---|
| M1 | `validationExpiry` jamais renseigné. Token valide **indéfiniment** | `routes.ts:139-153` (création), `routes.ts:421-442` (validation sans vérif expiry) | Token intercepté réutilisable des mois plus tard | Renseigner `validationExpiry` à `Date.now() + 48h` et vérifier dans `GET /api/validate` |
| M2 | `POST /api/auth/resend-validation` sans rate limiting | `routes.ts:467` (aucun middleware limiteur) | Spam d'emails vers le référent, coût Brevo | Ajouter rate limiter (3/h par IP) |
| M3 | Password minimum 6 chars. Compromis UX volontaire | `schema.ts:122`, `routes.ts:138` (hash bcrypt 10 rounds) | Mots de passe faibles | Indicateur de force côté frontend |

### Sévérité LOW

| ID | Description | Référence | Impact | Recommandation |
|---|---|---|---|---|
| L1 | Taille body JSON non explicitement limitée (défaut Express 100 Ko) | `server/index.ts:19-24` | Défaut raisonnable, non documenté | Ajouter `limit: '100kb'` à `express.json()` |
| L2 | `Permissions-Policy` absent | `server/index.ts:28-51` | APIs navigateur non restreintes | Ajouter `camera=(), microphone=(), geolocation=()` |
| L3 | Pas de timeout d'inactivité (7 jours fixe) | `server/auth.ts:83` | Session active 7j sans activité | `rolling: true` ou middleware inactivité |
| L4 | Endpoint push non validé comme URL | `routes.ts:1370-1381` (`routes.ts:1373` vérifie existence mais pas format) | URL arbitraire stockable | Valider `new URL(endpoint).protocol === 'https:'` |
| L5 | Route admin messages contourne `IStorage` | `routes.ts:1396-1446` (`routes.ts:1398` : `await import("./prisma")`) | Violation pattern architectural | Créer méthode dans `IStorage` |

### Sévérité INFO

| ID | Description | Référence |
|---|---|---|
| I1 | `sameSite: "lax"` | `auth.ts:86` — nécessaire pour liens email validation |
| I2 | CORS non configuré | `index.ts` — même domaine, non nécessaire |
| I3 | Clé VAPID publique sans auth | `routes.ts:1365-1368` — par conception |
| I4 | `createTableIfMissing: true` sessions | `auth.ts:77` — simplifie déploiement |

---

## Annexe A. Décisions de sécurité

| Décision | Justification | Référence |
|---|---|---|
| `sameSite: "lax"` | Liens validation email depuis domaine Brevo | `auth.ts:86` |
| CSP désactivée en dev | Vite hot-reload injecte scripts inline | `index.ts:30-43` |
| Password min 6 chars | UX seniors. bcrypt 10 rounds compense | `schema.ts:122`, `routes.ts:138` |
| Rate limiting IP only | Volume faible attendu | `routes.ts:76-90` |
| `xFrameOptions` désactivé en dev | Tout IDE affiche l'app dans un iframe (Replit, VS Code Live Preview…). En prod : `DENY` actif. Aucun impact pour un dev local hors Replit | `index.ts:59-61` |
| Photos auth-only | Matching affiche photos avant relation | `routes.ts:331` |
| `createTableIfMissing` | Simplifie déploiement | `auth.ts:77` |
| Pas de CORS | Même domaine frontend/backend | `index.ts:108-113` |
| VAPID public sans auth | Nécessaire pour abonnement push client | `routes.ts:1365-1368` |
| Freemail bloqués prod only | Simplifie dev/test | `schema.ts:116-118,151-156` |

## Annexe B. Dépendances de sécurité

| Package | Version | Rôle | Fichier |
|---|---|---|---|
| `helmet` | 8.1.0 | En-têtes HTTP | `server/index.ts:2,28-51` |
| `express-rate-limit` | 8.3.1 | Limitation de débit | `server/routes.ts:9,76-90` |
| `bcryptjs` | 3.0.3 | Hashing passwords (10 rounds) | `server/auth.ts:3,105`, `server/routes.ts:138` |
| `passport` | 0.7.0 | Framework auth | `server/auth.ts:1,94-122` |
| `express-session` | 1.18.2 | Gestion sessions | `server/auth.ts:4,72-89` |
| `connect-pg-simple` | 10.0.0 | Store sessions PostgreSQL | `server/auth.ts:5,10,74-78` |
| `multer` | 2.1.1 | Upload fichiers avec limites | `server/routes.ts:6,37-49` |
| `file-type` | 21.3.1 | Détection MIME (magic bytes) | `server/routes.ts:10,92-99` |

Exécuter `npm audit` régulièrement pour vérifier les vulnérabilités connues dans les dépendances.

## Annexe C. Guide sécurité contributeurs

### Règles obligatoires

1. **Ne jamais renvoyer le mot de passe** : utiliser `sanitizeUser()` (`routes.ts:51-54`) ou `sanitizeUserPublic()` (`routes.ts:56-74`)
2. **Toujours valider les entrées** : schéma Zod de `shared/schema.ts` avec `.safeParse()` (exemple : `routes.ts:575-580`)
3. **Utiliser les middlewares d'auth** : `requireAuth` (`auth.ts:141-146`) ou `requireAdmin` (`auth.ts:148-156`)
4. **Passer par IStorage** : ne jamais importer `prisma` dans `routes.ts` (`server/storage.ts` est le point d'accès)
5. **Photos via `getPhotoUrl()`** : `client/src/lib/photo-url.ts:1-8`
6. **Pas de données sensibles dans les logs** : tokens loggés uniquement en dev (`routes.ts:166-168`)
7. **Messages d'erreur génériques** : pas de stack trace côté client (`index.ts:95-106`)

### Checklist nouvelle route

- [ ] Middleware d'auth (`requireAuth` `auth.ts:141` ou `requireAdmin` `auth.ts:148`)
- [ ] Validation Zod du body (`shared/schema.ts`)
- [ ] Contrôle d'accès métier (propriétaire, participant)
- [ ] `sanitizeUser()` (`routes.ts:51`) ou `sanitizeUserPublic()` (`routes.ts:56`) si utilisateur renvoyé
- [ ] Messages d'erreur génériques
- [ ] Opérations DB via `IStorage` (`server/storage.ts`)

### Checklist upload de fichiers

- [ ] Limite de taille Multer (`routes.ts:39`)
- [ ] Validation extension (`routes.ts:40-48`)
- [ ] Validation magic bytes `validateImageMagicBytes()` (`routes.ts:92-99`)
- [ ] Nom UUID (`routes.ts:33`)
- [ ] Suppression fichier en cas d'échec ou remplacement
