# Audit de sécurité — FEVES

Dernière mise à jour : mars 2026

Ce document recense les mesures de sécurité en place, les décisions architecturales prises, et les vulnérabilités résiduelles connues avec leur classification.

---

## 1. En-têtes HTTP — Helmet

**Fichier** : `server/index.ts` (lignes 28-51)

Le middleware **Helmet v8** est appliqué globalement sur toutes les réponses Express.

| En-tête | Configuration |
|---|---|
| `Content-Security-Policy` | Stricte en production (`default-src 'self'`, `object-src 'none'`, `frame-src 'none'`). **Désactivée** en développement (conflit avec le hot-reload Vite) |
| `Strict-Transport-Security` | Activé en production uniquement (`max-age=31536000`, `includeSubDomains`) |
| `X-Content-Type-Options` | `nosniff` (toujours actif) |
| `X-Frame-Options` | `DENY` (toujours actif) |
| `Referrer-Policy` | `no-referrer` (toujours actif) |
| `X-XSS-Protection` | Activé par Helmet par défaut |

**Décision** : CSP désactivée en développement car Vite injecte des scripts inline pour le hot-reload qui ne sont pas compatibles avec une CSP stricte.

---

## 2. Rate limiting

**Fichier** : `server/routes.ts` (lignes 76-90)

Deux limiteurs basés sur l'adresse IP (`express-rate-limit` v8) :

| Route | Limite | Fenêtre | Message |
|---|---|---|---|
| `POST /api/auth/login` | 10 tentatives | 15 minutes | "Trop de tentatives de connexion. Réessayez dans 15 minutes." |
| `POST /api/auth/register` | 5 inscriptions | 1 heure | "Trop d'inscriptions depuis cette adresse. Réessayez dans une heure." |

Les en-têtes standard (`RateLimit-*`) sont envoyés ; les en-têtes legacy (`X-RateLimit-*`) sont désactivés.

**Décision** : Le rate limiting est basé sur l'IP uniquement (pas sur le couple IP+email). C'est un compromis acceptable pour le volume attendu de l'application.

---

## 3. Sessions et authentification

**Fichier** : `server/auth.ts` (lignes 66-89), `server/routes.ts` (lignes 185-217)

### Configuration des sessions

| Paramètre | Valeur | Justification |
|---|---|---|
| Store | PostgreSQL (`connect-pg-simple`) | Persistant, partageable entre instances |
| `maxAge` | 7 jours | Durée fixe de session |
| `httpOnly` | `true` | Empêche l'accès JavaScript au cookie |
| `secure` | `true` en production | Cookie transmis uniquement via HTTPS |
| `sameSite` | `"lax"` | Permet les liens entrants (validation email) tout en protégeant contre CSRF |
| `resave` | `false` | Évite les écritures inutiles |
| `saveUninitialized` | `false` | Pas de sessions créées pour les visiteurs anonymes |

### Protection contre la fixation de session

À la connexion (`POST /api/auth/login`), la session précédente est **régénérée** via `req.session.regenerate()` avant l'appel à `req.logIn()` (lignes 194-199). Un `try/catch` async/await gère proprement les erreurs de régénération.

### Stratégie d'authentification

Passport.js avec `LocalStrategy` :
- Email normalisé (`toLowerCase().trim()`) avant comparaison
- Mot de passe vérifié avec `bcrypt.compare`
- Comptes non-ACTIVE rejetés avec un message générique
- Messages d'erreur identiques pour email inconnu et mot de passe incorrect (anti-énumération)

---

## 4. Protection des photos de profil

**Fichier** : `server/routes.ts` (lignes 25-49, 92-99, 276-346)

### Upload sécurisé

1. **Multer** : limite de taille 5 Mo, extensions autorisées `.jpg`, `.jpeg`, `.png`, `.webp`
2. **Noms de fichiers** : remplacés par un UUID v4 + extension originale (pas de nom utilisateur)
3. **Validation des magic bytes** : la fonction `validateImageMagicBytes()` (lignes 92-99) vérifie le type MIME réel du fichier via la bibliothèque `file-type` v21. Si le contenu ne correspond pas à un JPEG, PNG ou WebP, le fichier est **supprimé du disque** et une erreur 400 est renvoyée.

### Accès aux photos

Le dossier `uploads/` n'est **pas** servi par Express en tant que fichiers statiques.

Les photos sont servies exclusivement par la route `GET /api/photos/:filename` (lignes 323-346) :
- **Authentification** : `requireAuth` — seuls les utilisateurs connectés peuvent voir les photos
- **Validation du nom** : regex `^[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$` — empêche le path traversal
- **En-têtes de sécurité** :
  - `X-Content-Type-Options: nosniff`
  - `Cache-Control: private, max-age=3600`
  - `Content-Disposition: inline`
  - `Content-Type` déduit de l'extension

**Fichier frontend** : `client/src/lib/photo-url.ts` — la fonction `getPhotoUrl()` convertit les chemins `/uploads/xxx` stockés en base en URLs `/api/photos/xxx` pour le frontend.

### Suppression

- Lors de la suppression de la photo de profil (`DELETE /api/auth/me/photo`) : le fichier est supprimé du disque (lignes 304-321)
- Lors de la suppression du compte (`DELETE /api/admin/users/:id`) : la photo est supprimée du disque avant la suppression en base (lignes 1076-1091)
- Lors du remplacement de la photo (`POST /api/auth/me/photo`) : l'ancienne photo est supprimée du disque (lignes 287-289)

---

## 5. Sanitization des données utilisateur

**Fichier** : `server/routes.ts` (lignes 51-74)

Deux niveaux de sanitization :

### `sanitizeUser(user)` — routes propres à l'utilisateur et admin

Retire : `password`, `validationToken`, `validationExpiry`.

Utilisé pour : `/api/auth/me`, `/api/auth/me/photo`, toutes les routes `/api/admin/users/*`.

### `sanitizeUserPublic(user)` — routes inter-utilisateurs

Retire en plus : `phone`, `address`, `postalCode`, `trustedPersonName`, `trustedPersonEmail`, `referentEmail`, `referentTitle`, `referentFirstName`, `referentLastName`, `validatorEmail`.

Utilisé pour :
- `GET /api/matching/suggestions` (ligne 518) — données des profils suggérés
- `GET /api/relations` (lignes 537-538) — données senior/junior de chaque relation
- `GET /api/relations/:id` (lignes 559-560) — données senior/junior d'une relation

---

## 6. Validation des entrées

### Schémas Zod

**Fichier** : `shared/schema.ts`

Toutes les routes qui reçoivent un body utilisent un schéma Zod pour la validation :

| Schéma | Route | Validation notable |
|---|---|---|
| `insertUserSchema` | `POST /api/auth/register` | Anti auto-validation (validatorEmail ≠ email), domaines freemail bloqués pour les validateurs Junior en production |
| `loginSchema` | `POST /api/auth/login` | Email valide, mot de passe min 6 caractères |
| `changePasswordSchema` | `PATCH /api/auth/me/password` | Ancien et nouveau mot de passe min 6 caractères |
| `createRelationSchema` | `POST /api/relations` | `juniorId` requis |
| `insertInterventionSchema` | `POST /api/relations/:id/interventions` | Date requise, durée 30-480 min |
| `feedbackSchema` | `POST /api/interventions/:id/feedback` | Note 1-5, commentaire max 1000 caractères |
| `createPaymentSchema` | `POST /api/admin/payments` | Montant positif, libellé requis |
| `createAdminSchema` | `POST /api/admin/create-admin` | Email valide, mot de passe min 6 caractères |

### Validation des contenus messages

`POST /api/messages/conversations/:id` : le contenu est validé côté route (max 2000 caractères, string non vide).

---

## 7. Protection des routes et contrôle d'accès

### Middlewares

**Fichier** : `server/auth.ts` (lignes 141-156)

| Middleware | Vérifie |
|---|---|
| `requireAuth` | `req.isAuthenticated()` — renvoie 401 si non connecté |
| `requireAdmin` | `req.isAuthenticated()` ET `req.user.role === "ADMIN"` — renvoie 403 si non admin |

### Contrôles métier dans les routes

Au-delà des middlewares, les routes vérifient les permissions métier :

| Route | Contrôle |
|---|---|
| `POST /api/relations` | Seuls les SENIOR peuvent créer des relations |
| `PATCH /api/relations/:id/accept` | Seul le JUNIOR destinataire peut accepter |
| `PATCH /api/relations/:id/reject` | Seul le JUNIOR destinataire peut refuser |
| `POST /api/relations/:id/interventions` | Si `PENDING_FIRST_MEETING` : ADMIN uniquement. Si `ACTIVE` : SENIOR ou ADMIN |
| `PATCH /api/interventions/:id/confirm` | Seul le JUNIOR de la relation |
| `PATCH /api/interventions/:id/done` | ADMIN uniquement |
| `PATCH /api/interventions/:id/cancel` | SENIOR de la relation ou ADMIN |
| `POST /api/interventions/:id/feedback` | Participant de la relation uniquement, et seulement s'il n'a pas déjà noté |
| `GET /api/messages/conversations/:id` | Participant de la relation uniquement |
| `POST /api/messages/conversations/:id` | Participant de la relation ACTIVE uniquement |
| `PATCH /api/notifications/:id/read` | Propriétaire de la notification uniquement |

---

## 8. Logging et informations exposées

**Fichier** : `server/index.ts` (lignes 66-90)

### Logs de requêtes API

- Les réponses JSON sont **loguées uniquement en développement** (`NODE_ENV !== 'production'`). En production, seuls la méthode, le path, le status code et la durée sont loggés.
- Les tokens de validation sont loggés dans la console **uniquement en développement** (lignes 166-168 de `routes.ts`).

### Réponses d'erreur

- Les messages d'erreur sont génériques côté client ("Erreur interne", "Identifiants incorrects").
- Les stack traces ne sont jamais envoyées dans les réponses HTTP.
- La route `POST /api/auth/resend-validation` renvoie toujours un 200 avec un message identique, qu'un compte existe ou non (anti-énumération).

---

## 9. Décisions de sécurité documentées

| Décision | Justification |
|---|---|
| `sameSite: "lax"` (pas `"strict"`) | Les liens de validation d'inscription proviennent d'emails (domaine externe). `strict` empêcherait la navigation avec le cookie de session |
| CSP désactivée en dev | Vite injecte des scripts inline pour le hot-reload. Une CSP stricte casserait le développement |
| Mot de passe min 6 caractères | Compromis UX pour le public senior. Un minimum plus élevé augmenterait les abandons à l'inscription |
| Rate limiting sur IP uniquement | Le volume attendu ne justifie pas un rate limiting par couple IP+email |
| Photos accessibles à tout utilisateur authentifié | Le matching affiche les photos avant toute relation. Restreindre l'accès aux photos aux seules relations casserait cette fonctionnalité |
| `createTableIfMissing: true` pour la table de sessions | Simplifie le déploiement initial. La table est créée automatiquement par `connect-pg-simple` si absente |

---

## 10. Vulnérabilités résiduelles connues

### Sévérité MEDIUM

| ID | Description | Fichier | Impact | Recommandation |
|---|---|---|---|---|
| M1 | Le champ `validationExpiry` n'est jamais renseigné à l'inscription. Le token de validation reste valide **indéfiniment** | `routes.ts:139-153` | Un token de validation intercepté pourrait être utilisé des mois plus tard | Renseigner `validationExpiry` à `new Date(Date.now() + 48 * 60 * 60 * 1000)` et vérifier l'expiration dans `GET /api/validate` |
| M2 | La route `POST /api/auth/resend-validation` n'a **aucun rate limiting** | `routes.ts:467` | Un attaquant pourrait spammer des emails de validation via cette route | Ajouter un rate limiter similaire à `registerLimiter` (ex: 3 requêtes / heure par IP) |
| M3 | Le mot de passe minimum est de 6 caractères (`shared/schema.ts:122`) | `shared/schema.ts:122` | Mots de passe faibles. Compromis UX volontaire pour le public senior | Documenter ce choix. Envisager un indicateur de force côté frontend sans augmenter le minimum |

### Sévérité LOW

| ID | Description | Fichier | Impact | Recommandation |
|---|---|---|---|---|
| L1 | La taille du body JSON n'est pas explicitement limitée (Express utilise le défaut de 100 Ko) | `server/index.ts:19-24` | Le défaut Express est raisonnable, mais non explicite | Ajouter `limit: '100kb'` à `express.json()` pour documenter l'intention |
| L2 | L'en-tête `Permissions-Policy` n'est pas configuré | `server/index.ts:28-51` | Les APIs navigateur (géolocalisation, caméra, microphone) ne sont pas explicitement restreintes | Ajouter `Permissions-Policy: camera=(), microphone=(), geolocation=()` via Helmet ou middleware custom |
| L3 | Pas de timeout d'inactivité de session (durée fixe de 7 jours) | `server/auth.ts:83` | Un utilisateur reste connecté 7 jours même sans activité | Implémenter un `rolling: true` avec un `maxAge` plus court, ou un middleware de timeout d'inactivité |
| L4 | L'endpoint de souscription push n'est pas validé comme URL | `routes.ts:1370-1381` | Un attaquant pourrait stocker une URL arbitraire comme endpoint push | Valider que `endpoint` est une URL HTTPS valide avant stockage |
| L5 | La route `GET /api/admin/messages/conversations/:id` contourne la couche `IStorage` avec un import direct de Prisma | `routes.ts:1396-1446` | Viole le pattern architectural et rend le code plus difficile à maintenir | Créer une méthode `getConversationWithMessages()` dans `IStorage` |

### Sévérité INFO

| ID | Description | Notes |
|---|---|---|
| I1 | `sameSite: "lax"` au lieu de `"strict"` | Nécessaire pour les liens de validation email. Voir section "Décisions" |
| I2 | CORS non configuré explicitement | Non nécessaire — le frontend et le backend sont servis sur le même domaine/port |
| I3 | La clé publique VAPID est accessible sans authentification (`GET /api/push/vapid-key`) | Par conception — la clé publique est nécessaire côté client pour s'abonner aux notifications push |
| I4 | `createTableIfMissing: true` dans la configuration de session | Simplifie le déploiement, mais en production il est préférable de créer la table via migration |
