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

**Signaler une vulnérabilité** : contacter l'administrateur du projet directement. Ne pas ouvrir d'issue publique.

---

## 2. En-têtes HTTP — Helmet

**Fichier** : `server/index.ts:28-51`

Le middleware Helmet v8.1.0 est appliqué globalement :

| En-tête | Configuration | Lignes |
|---|---|---|
| `Content-Security-Policy` | Stricte en production (`default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:`, `connect-src 'self'`, `object-src 'none'`, `frame-src 'none'`). Désactivée en développement (Vite hot-reload) | `index.ts:30-43` |
| `Strict-Transport-Security` | Production uniquement : `max-age=31536000`, `includeSubDomains` | `index.ts:44-46` |
| `X-Content-Type-Options` | `nosniff` — toujours actif | `index.ts:48` |
| `X-Frame-Options` | `DENY` — empêche le clickjacking | `index.ts:49` |
| `Referrer-Policy` | `no-referrer` — toujours actif | `index.ts:47` |

---

## 3. Rate limiting

**Fichier** : `server/routes.ts:76-90`

Deux limiteurs basés sur l'adresse IP (package `express-rate-limit` v8.3.1) :

| Route | Limite | Fenêtre | Définition | Application |
|---|---|---|---|---|
| `POST /api/auth/login` | 10 tentatives | 15 minutes | `routes.ts:76-82` | `routes.ts:185` |
| `POST /api/auth/register` | 5 inscriptions | 1 heure | `routes.ts:84-90` | `routes.ts:112` |

En-têtes standard `RateLimit-*` envoyés (`standardHeaders: true`, `routes.ts:80,88`). En-têtes legacy désactivés (`legacyHeaders: false`, `routes.ts:81,89`).

---

## 4. Sessions et authentification

### 4.1 Configuration des sessions

**Fichier** : `server/auth.ts:66-89`

La variable d'environnement `SESSION_SECRET` est **obligatoire** — l'application refuse de démarrer si elle est absente (`auth.ts:68-70` : `throw new Error("SESSION_SECRET environment variable is required")`).

| Paramètre | Valeur | Ligne |
|---|---|---|
| Store | PostgreSQL via `connect-pg-simple` | `auth.ts:74-78` |
| `createTableIfMissing` | `true` | `auth.ts:77` |
| `secret` | `process.env.SESSION_SECRET` | `auth.ts:79` |
| `resave` | `false` | `auth.ts:80` |
| `saveUninitialized` | `false` | `auth.ts:81` |
| `maxAge` | 7 jours (604800000 ms) | `auth.ts:83` |
| `httpOnly` | `true` | `auth.ts:84` |
| `secure` | `true` en production uniquement | `auth.ts:85` |
| `sameSite` | `"lax"` | `auth.ts:86` |

### 4.2 Hashing des mots de passe

Les mots de passe sont hashés avec `bcryptjs` v3.0.3, facteur de coût **10** (`routes.ts:138` : `bcrypt.hash(data.password, 10)`). La comparaison se fait via `bcrypt.compare` (`auth.ts:105`).

### 4.3 Protection contre la fixation de session

**Fichier** : `server/routes.ts:193-199`

À la connexion, la session existante est **régénérée** via `req.session.regenerate()` avant `req.logIn()`. Un `try/catch` async/await gère les erreurs et renvoie un 500 générique.

### 4.4 Stratégie d'authentification

**Fichier** : `server/auth.ts:94-122`

- Email normalisé `toLowerCase().trim()` avant comparaison (`auth.ts:99`)
- Comptes non-`ACTIVE` rejetés (`auth.ts:110-114`)
- Messages d'erreur identiques pour email inconnu et mot de passe incorrect : `"Email ou mot de passe incorrect"` — anti-énumération (`auth.ts:102,107`)

### 4.5 Token de validation

À l'inscription, un token UUID est généré (`routes.ts:139` : `crypto.randomUUID()`). Lors de la validation (`GET /api/validate`, `routes.ts:421-442`), le token est **effacé** en base (`routes.ts:435` : `validationToken: null`) pour empêcher sa réutilisation.

Lors du renvoi de validation (`routes.ts:477-481`), un **nouveau** token remplace l'ancien.

---

## 5. Protection des photos de profil

### 5.1 Upload sécurisé

**Fichier** : `server/routes.ts:25-49, 92-99`

| Protection | Détail | Ligne |
|---|---|---|
| Limite de taille | 5 Mo maximum | `routes.ts:39` |
| Extensions autorisées | `.jpg`, `.jpeg`, `.png`, `.webp` | `routes.ts:41` |
| Nommage UUID | `crypto.randomUUID()` + extension — aucun nom utilisateur | `routes.ts:33` |
| Magic bytes | `validateImageMagicBytes()` vérifie le MIME réel via `file-type` v21.3.1 | `routes.ts:92-99` |
| Rejet sécurisé | Si magic bytes invalides, fichier supprimé du disque (`fs.unlinkSync`) + erreur 400 | `routes.ts:96-97` |
| Double validation | Extension par Multer (`routes.ts:40-48`) + magic bytes après écriture (`routes.ts:130-136`, `routes.ts:281-285`) | |

### 5.2 Accès authentifié aux photos

**Fichier** : `server/routes.ts:323-346`

Le dossier `uploads/` n'est **pas** servi publiquement. Aucun `express.static("uploads")` n'existe dans le code.

Route `GET /api/photos/:filename` (`routes.ts:331`) :

| Protection | Détail | Ligne |
|---|---|---|
| Authentification | Middleware `requireAuth` | `routes.ts:331` |
| Anti path-traversal | Regex `^[a-f0-9-]{36}\.(jpg\|jpeg\|png\|webp)$` | `routes.ts:323,333` |
| `X-Content-Type-Options` | `nosniff` | `routes.ts:342` |
| `Cache-Control` | `private, max-age=3600` | `routes.ts:343` |
| `Content-Disposition` | `inline` | `routes.ts:344` |

**Frontend** : `client/src/lib/photo-url.ts` — `getPhotoUrl()` convertit `/uploads/xxx` en `/api/photos/xxx`.

### 5.3 Suppression des fichiers

| Action | Ligne |
|---|---|
| Suppression de photo (`DELETE /api/auth/me/photo`) | `routes.ts:307-309` |
| Remplacement de photo (`POST /api/auth/me/photo`) | `routes.ts:287-289` |
| Suppression de compte par admin (`DELETE /api/admin/users/:id`) | `routes.ts:1081-1083` |
| Échec validation magic bytes | `routes.ts:96` |

---

## 6. Sanitization des données (RGPD)

**Fichier** : `server/routes.ts:51-74`

### 6.1 `sanitizeUser(user)` (`routes.ts:51-54`)

**Champs retirés** : `password`, `validationToken`, `validationExpiry`

**Routes utilisant `sanitizeUser`** :
- `POST /api/auth/me/photo` → `routes.ts:293`
- `DELETE /api/auth/me/photo` → `routes.ts:312`
- `GET /api/admin/users` → `routes.ts:1041`
- `PATCH /api/admin/users/:id/validate` → `routes.ts:1056`
- `PATCH /api/admin/users/:id/suspend` → `routes.ts:1069`

### 6.2 `sanitizeUserPublic(user)` (`routes.ts:56-74`)

**Champs retirés en plus** : `phone`, `address`, `postalCode`, `trustedPersonName`, `trustedPersonEmail`, `referentEmail`, `referentTitle`, `referentFirstName`, `referentLastName`, `validatorEmail`

Ces champs sont des données personnelles sensibles (coordonnées, personnes de confiance/référentes) qui ne doivent pas être exposées aux autres utilisateurs.

**Routes utilisant `sanitizeUserPublic`** :
- `GET /api/matching/suggestions` → `routes.ts:518`
- `GET /api/relations` → `routes.ts:537-538`
- `GET /api/relations/:id` → `routes.ts:559-560`

Le champ `password` (hash bcrypt) est retiré par les deux fonctions — il n'apparaît dans **aucune** réponse API.

---

## 7. Matrice d'autorisations

### 7.1 Middlewares

**Fichier** : `server/auth.ts:141-156`

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
| `GET /api/auth/me` | ○ | ● | ● | ● | | `routes.ts:227` |
| `PATCH /api/auth/me` | ○ | ● | ● | ● | Profil propre | `routes.ts:237` |
| `PATCH /api/auth/me/password` | ○ | ● | ● | ● | Profil propre | `routes.ts:256` |
| `POST /api/auth/me/photo` | ○ | ● | ● | ● | Profil propre | `routes.ts:276` |
| `DELETE /api/auth/me/photo` | ○ | ● | ● | ● | Profil propre | `routes.ts:304` |
| `POST /api/auth/resend-validation` | ● | ● | ● | ● | Pas de rate limiting (M2) | `routes.ts:467` |
| `GET /api/validate` | ● | ● | ● | ● | Token requis, effacé après usage | `routes.ts:421` |
| `GET /api/photos/:filename` | ○ | ● | ● | ● | Regex anti path-traversal | `routes.ts:331` |

#### Notifications

| Route | Anonyme | Senior | Junior | Admin | Condition | Ligne |
|---|---|---|---|---|---|---|
| `GET /api/notifications` | ○ | ● | ● | ● | Propres notifications | `routes.ts:406` |
| `GET /api/notifications/count` | ○ | ● | ● | ● | Propres notifications | `routes.ts:414` |
| `PATCH /api/notifications/:id/read` | ○ | ◐ | ◐ | ◐ | Propriétaire uniquement | `routes.ts:453-464` |
| `PATCH /api/notifications/read-all` | ○ | ● | ● | ● | Propres notifications | `routes.ts:444` |

#### Matching & Relations

| Route | Anonyme | Senior | Junior | Admin | Condition | Ligne |
|---|---|---|---|---|---|---|
| `GET /api/matching/suggestions` | ○ | ● | ● | ○ | Via `sanitizeUserPublic` | `routes.ts:507` |
| `POST /api/relations` | ○ | ● | ○ | ○ | Senior uniquement | `routes.ts:568-571` |
| `PATCH /api/relations/:id/accept` | ○ | ○ | ◐ | ○ | Junior destinataire | `routes.ts:612-618` |
| `PATCH /api/relations/:id/reject` | ○ | ○ | ◐ | ○ | Junior destinataire | `routes.ts:653-659` |
| `PATCH /api/relations/:id/close` | ○ | ◐ | ◐ | ● | Participant ou Admin | `routes.ts:683-690` |
| `GET /api/relations` | ○ | ● | ● | ● | Propres relations | `routes.ts:532` |
| `GET /api/relations/:id` | ○ | ◐ | ◐ | ● | Participant ou Admin | `routes.ts:547-554` |

#### Interventions

| Route | Anonyme | Senior | Junior | Admin | Condition | Ligne |
|---|---|---|---|---|---|---|
| `POST /api/relations/:id/interventions` | ○ | ◐ | ○ | ◐ | `PENDING_FIRST_MEETING` : Admin seul. `ACTIVE` : Senior ou Admin | `routes.ts:717-735` |
| `PATCH /api/interventions/:id/confirm` | ○ | ○ | ◐ | ○ | Junior de la relation | `routes.ts:790` |
| `PATCH /api/interventions/:id/done` | ○ | ○ | ○ | ● | Admin uniquement | |
| `PATCH /api/interventions/:id/cancel` | ○ | ◐ | ○ | ● | Senior ou Admin | |
| `POST /api/interventions/:id/feedback` | ○ | ◐ | ◐ | ○ | Participant, pas déjà noté | |

#### Messagerie

| Route | Anonyme | Senior | Junior | Admin | Condition | Ligne |
|---|---|---|---|---|---|---|
| `GET /api/messages/conversations` | ○ | ● | ● | ● | Propres conversations | |
| `GET /api/messages/conversations/:id` | ○ | ◐ | ◐ | ○ | Participant, relation ACTIVE | |
| `POST /api/messages/conversations/:id` | ○ | ◐ | ◐ | ○ | Participant, relation ACTIVE | |
| `GET /api/messages/stream` (SSE) | ○ | ● | ● | ● | Connexion persistante | |

#### Favoris

| Route | Anonyme | Senior | Junior | Admin | Condition | Ligne |
|---|---|---|---|---|---|---|
| `GET /api/favorites` | ○ | ● | ○ | ○ | Senior uniquement | `routes.ts:348` |
| `POST /api/favorites/:juniorId` | ○ | ● | ○ | ○ | Senior uniquement | |
| `DELETE /api/favorites/:juniorId` | ○ | ● | ○ | ○ | Senior uniquement | |

#### Push

| Route | Anonyme | Senior | Junior | Admin | Condition | Ligne |
|---|---|---|---|---|---|---|
| `GET /api/push/vapid-key` | ● | ● | ● | ● | Clé publique — par conception | `routes.ts:1365` |
| `POST /api/push/subscribe` | ○ | ● | ● | ● | | `routes.ts:1370` |

#### Administration

| Route | Anonyme | Senior | Junior | Admin | Condition | Ligne |
|---|---|---|---|---|---|---|
| `GET /api/admin/users` | ○ | ○ | ○ | ● | Via `sanitizeUser` | `routes.ts:1038` |
| `PATCH /api/admin/users/:id/validate` | ○ | ○ | ○ | ● | `PENDING_VALIDATION` uniquement | `routes.ts:1048` |
| `PATCH /api/admin/users/:id/suspend` | ○ | ○ | ○ | ● | Impossible sur un ADMIN (`routes.ts:1067`) | `routes.ts:1063` |
| `DELETE /api/admin/users/:id` | ○ | ○ | ○ | ● | Impossible sur un ADMIN (`routes.ts:1080`) | `routes.ts:1076` |
| `POST /api/admin/create-admin` | ○ | ○ | ○ | ● | | |
| `GET /api/admin/relations` | ○ | ○ | ○ | ● | | |
| `GET /api/admin/relations/pending-meeting` | ○ | ○ | ○ | ● | | |
| `GET /api/admin/interventions` | ○ | ○ | ○ | ● | | |
| `POST /api/admin/recommendations` | ○ | ○ | ○ | ● | | |
| `DELETE /api/admin/recommendations/:id` | ○ | ○ | ○ | ● | | |
| `GET /api/admin/payments` | ○ | ○ | ○ | ● | | |
| `POST /api/admin/payments` | ○ | ○ | ○ | ● | | `routes.ts:1193` |
| `GET /api/admin/messages/conversations` | ○ | ○ | ○ | ● | | `routes.ts:1386` |
| `GET /api/admin/messages/conversations/:id` | ○ | ○ | ○ | ● | Bypass IStorage (L5) | `routes.ts:1396` |
| `DELETE /api/admin/messages/:messageId` | ○ | ○ | ○ | ● | Soft delete | `routes.ts:1448` |

---

## 8. Logging et informations exposées

**Fichier** : `server/index.ts:66-90`

### 8.1 Logs de requêtes API (`index.ts:77-86`)

- **Développement** : méthode, path, status, durée + body JSON de la réponse (`index.ts:81-83`)
- **Production** : méthode, path, status, durée **uniquement** — les corps de réponse ne sont pas loggés (`index.ts:81` : `process.env.NODE_ENV !== "production"`)

### 8.2 Tokens de validation (dev uniquement)

Les liens de validation (contenant le token UUID) sont loggés **uniquement en développement** :
- À l'inscription : `routes.ts:166-168`
- Au renvoi de validation : `routes.ts:486-488`

### 8.3 Anti-énumération

- `POST /api/auth/login` : message identique pour email inconnu et mot de passe incorrect (`auth.ts:102,107`)
- `POST /api/auth/resend-validation` : renvoie **toujours** un 200 avec le même message (`routes.ts:498,501`)

### 8.4 Erreurs serveur

- Les stack traces ne sont **jamais** envoyées au client (`index.ts:95-106`)
- Les messages d'erreur sont génériques côté client
- Les erreurs détaillées sont loguées côté serveur uniquement via `console.error`

---

## 9. Décisions de sécurité documentées

| Décision | Justification | Référence |
|---|---|---|
| `sameSite: "lax"` (pas `"strict"`) | Les liens de validation d'inscription proviennent d'emails (domaine Brevo). `strict` empêcherait le cookie de session d'être envoyé lors du clic | `auth.ts:86` |
| CSP désactivée en dev | Vite injecte des scripts et styles inline pour le hot-reload incompatibles avec CSP stricte | `index.ts:30-43` |
| Mot de passe min 6 caractères | Compromis UX pour le public senior. Un minimum plus élevé augmenterait les abandons. bcrypt (10 rounds) compense | `schema.ts:122`, `routes.ts:138` |
| Rate limiting sur IP uniquement | Volume attendu faible (quelques dizaines d'utilisateurs en Guadeloupe) | `routes.ts:76-90` |
| Photos accessibles à tout utilisateur authentifié | Le matching affiche les photos avant toute relation | `routes.ts:331` |
| `createTableIfMissing: true` | Simplifie le déploiement. La table `session` est créée automatiquement par `connect-pg-simple` | `auth.ts:77` |
| Pas de CORS explicite | Frontend et backend sont servis sur le même domaine/port par Express | `index.ts:108-113` |
| Clé publique VAPID sans auth | Nécessaire côté client pour initier l'abonnement push | `routes.ts:1365-1368` |
| Domaines freemail bloqués uniquement en production | Simplifie le développement et les tests avec des emails personnels | `schema.ts:116-118,152-154` |

---

## 10. Vulnérabilités résiduelles connues

### Sévérité MEDIUM

| ID | Description | Référence | Impact | Recommandation |
|---|---|---|---|---|
| M1 | `validationExpiry` n'est jamais renseigné à l'inscription. Le token de validation reste valide **indéfiniment** | `routes.ts:139-153` (création), `routes.ts:421-442` (validation sans vérif expiry) | Un token intercepté pourrait être utilisé des mois plus tard | Renseigner `validationExpiry` à `Date.now() + 48h` et vérifier dans `GET /api/validate` |
| M2 | `POST /api/auth/resend-validation` n'a **aucun rate limiting** | `routes.ts:467` (pas de middleware limiteur) | Spam d'emails vers le référent, coût Brevo | Ajouter un rate limiter (3/h par IP) |
| M3 | Mot de passe minimum 6 caractères | `shared/schema.ts:122` | Mots de passe faibles. Compromis UX volontaire | Indicateur de force côté frontend sans augmenter le minimum |

### Sévérité LOW

| ID | Description | Référence | Impact | Recommandation |
|---|---|---|---|---|
| L1 | Taille body JSON non explicitement limitée (défaut Express : 100 Ko) | `server/index.ts:19-24` | Défaut raisonnable, mais non documenté dans le code | Ajouter `limit: '100kb'` à `express.json()` |
| L2 | En-tête `Permissions-Policy` absent | `server/index.ts:28-51` | APIs navigateur non restreintes explicitement | Ajouter `Permissions-Policy: camera=(), microphone=(), geolocation=()` |
| L3 | Pas de timeout d'inactivité de session (durée fixe 7 jours) | `server/auth.ts:83` | Session active 7j même sans activité | Envisager `rolling: true` ou middleware d'inactivité |
| L4 | Endpoint push non validé comme URL | `routes.ts:1370-1381` | URL arbitraire stockée. Impact limité : `web-push` échouera | Valider `new URL(endpoint).protocol === 'https:'` |
| L5 | Route admin messages contourne `IStorage` avec import direct Prisma | `routes.ts:1396-1446` (`await import("./prisma")`) | Viole le pattern architectural, plus difficile à maintenir | Créer `getConversationWithMessages()` dans `IStorage` |

### Sévérité INFO

| ID | Description | Référence |
|---|---|---|
| I1 | `sameSite: "lax"` au lieu de `"strict"` | `auth.ts:86` — nécessaire pour les liens email |
| I2 | CORS non configuré explicitement | `index.ts` — même domaine, non nécessaire |
| I3 | Clé publique VAPID sans authentification | `routes.ts:1365-1368` — par conception |
| I4 | `createTableIfMissing: true` pour sessions | `auth.ts:77` — simplifie le déploiement |

---

## 11. Dépendances de sécurité

| Package | Version | Rôle | Fichier d'utilisation |
|---|---|---|---|
| `helmet` | 8.1.0 | En-têtes HTTP de sécurité | `server/index.ts:28-51` |
| `express-rate-limit` | 8.3.1 | Limitation de débit | `server/routes.ts:9,76-90` |
| `bcryptjs` | 3.0.3 | Hashing mots de passe (10 rounds) | `server/auth.ts:105`, `server/routes.ts:138` |
| `passport` | 0.7.0 | Framework d'authentification | `server/auth.ts:94-122` |
| `express-session` | 1.18.2 | Gestion des sessions | `server/auth.ts:72-89` |
| `connect-pg-simple` | 10.0.0 | Store de sessions PostgreSQL | `server/auth.ts:10,74-78` |
| `multer` | 2.1.1 | Upload fichiers avec limites | `server/routes.ts:37-49` |
| `file-type` | 21.3.1 | Détection MIME réel (magic bytes) | `server/routes.ts:10,92-99` |

Exécuter `npm audit` régulièrement pour vérifier les vulnérabilités connues dans les dépendances.

---

## 12. Guide sécurité pour les contributeurs

### Règles obligatoires

1. **Ne jamais renvoyer le mot de passe** : utiliser `sanitizeUser()` (`routes.ts:51-54`) ou `sanitizeUserPublic()` (`routes.ts:56-74`) avant chaque `res.json` contenant un objet utilisateur
2. **Toujours valider les entrées** : chaque route POST/PATCH/PUT doit utiliser un schéma Zod de `shared/schema.ts` avec `.safeParse()` (voir `routes.ts:575-580` pour un exemple)
3. **Utiliser les middlewares d'auth** : toute nouvelle route doit être protégée par `requireAuth` (`auth.ts:141-146`) ou `requireAdmin` (`auth.ts:148-156`) sauf si intentionnellement publique
4. **Passer par IStorage** : ne jamais importer `prisma` directement dans `routes.ts`. Toutes les opérations DB passent par `server/storage.ts` (exception actuelle : L5)
5. **Photos via `getPhotoUrl()`** : côté frontend, utiliser `getPhotoUrl()` de `client/src/lib/photo-url.ts` pour afficher les photos
6. **Pas de données sensibles dans les logs** : ne jamais logger mots de passe, tokens, ou données personnelles. Les tokens de validation ne sont loggés qu'en `NODE_ENV !== 'production'` (`routes.ts:166-168`)
7. **Messages d'erreur génériques** : ne jamais renvoyer de stack trace ou de détail technique dans les réponses d'erreur

### Checklist nouvelle route

- [ ] Middleware d'auth approprié (`requireAuth` ou `requireAdmin`)
- [ ] Validation Zod du body si applicable
- [ ] Contrôle d'accès métier (propriétaire, participant, etc.)
- [ ] `sanitizeUser()` ou `sanitizeUserPublic()` si objet utilisateur renvoyé
- [ ] Messages d'erreur génériques
- [ ] Opérations DB via `IStorage` uniquement

### Checklist upload de fichiers

- [ ] Limite de taille via Multer (`routes.ts:39`)
- [ ] Validation de l'extension (`routes.ts:40-48`)
- [ ] Validation des magic bytes via `validateImageMagicBytes()` (`routes.ts:92-99`)
- [ ] Nom de fichier remplacé par un UUID (`routes.ts:33`)
- [ ] Suppression du fichier en cas d'échec ou de remplacement
