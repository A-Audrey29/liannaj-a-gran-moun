# Audit de sécurité — FEVES

Dernière mise à jour : mars 2026

Ce document recense les mesures de sécurité en place, les décisions architecturales, la matrice d'autorisations, la gestion des données personnelles (RGPD), et les vulnérabilités résiduelles classifiées. Il sert de référence pour les développeurs et les audits.

Pour signaler une vulnérabilité, contacter l'administrateur du projet directement (ne pas ouvrir d'issue publique).

---

## Table des matières

1. [En-têtes HTTP — Helmet](#1-en-têtes-http--helmet)
2. [Rate limiting](#2-rate-limiting)
3. [Sessions et authentification](#3-sessions-et-authentification)
4. [Protection des photos de profil](#4-protection-des-photos-de-profil)
5. [Sanitization des données utilisateur (RGPD)](#5-sanitization-des-données-utilisateur-rgpd)
6. [Validation des entrées](#6-validation-des-entrées)
7. [Matrice d'autorisations et contrôle d'accès](#7-matrice-dautorisations-et-contrôle-daccès)
8. [Logging et informations exposées](#8-logging-et-informations-exposées)
9. [Décisions de sécurité documentées](#9-décisions-de-sécurité-documentées)
10. [Vulnérabilités résiduelles connues](#10-vulnérabilités-résiduelles-connues)
11. [Dépendances de sécurité](#11-dépendances-de-sécurité)
12. [Guide sécurité pour les contributeurs](#12-guide-sécurité-pour-les-contributeurs)

---

## 1. En-têtes HTTP — Helmet

**Fichier** : `server/index.ts` (lignes 28-51)

Le middleware **Helmet v8** est appliqué globalement sur toutes les réponses Express.

| En-tête | Configuration |
|---|---|
| `Content-Security-Policy` | Stricte en production (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `frame-src 'none'`). **Désactivée** en développement (conflit avec le hot-reload Vite) |
| `Strict-Transport-Security` | Activé en production uniquement (`max-age=31536000`, `includeSubDomains`) |
| `X-Content-Type-Options` | `nosniff` (toujours actif) |
| `X-Frame-Options` | `DENY` (toujours actif) — empêche le clickjacking |
| `Referrer-Policy` | `no-referrer` (toujours actif) |
| `X-XSS-Protection` | Activé par Helmet par défaut |

**Décision** : CSP désactivée en développement car Vite injecte des scripts inline pour le hot-reload qui ne sont pas compatibles avec une CSP stricte.

---

## 2. Rate limiting

**Fichier** : `server/routes.ts` (lignes 76-90)

Deux limiteurs basés sur l'adresse IP (`express-rate-limit` v8) :

| Route | Limite | Fenêtre | Ligne |
|---|---|---|---|
| `POST /api/auth/login` | 10 tentatives | 15 minutes | `routes.ts:76-82` |
| `POST /api/auth/register` | 5 inscriptions | 1 heure | `routes.ts:84-90` |

Application des limiteurs :
- Login : `routes.ts:185` — `app.post("/api/auth/login", loginLimiter, ...)`
- Register : `routes.ts:112` — `app.post("/api/auth/register", registerLimiter, ...)`

Les en-têtes standard `RateLimit-*` sont envoyés dans les réponses ; les en-têtes legacy `X-RateLimit-*` sont désactivés (`legacyHeaders: false`).

**Décision** : Le rate limiting est basé sur l'IP uniquement (pas sur le couple IP+email). Compromis acceptable pour le volume attendu de l'application.

---

## 3. Sessions et authentification

**Fichiers** : `server/auth.ts` (lignes 66-89), `server/routes.ts` (lignes 185-217)

### Configuration des sessions (`auth.ts:72-89`)

| Paramètre | Valeur | Justification |
|---|---|---|
| Store | PostgreSQL via `connect-pg-simple` (`auth.ts:74-78`) | Persistant, partageable entre instances |
| `createTableIfMissing` | `true` (`auth.ts:77`) | La table `session` est créée automatiquement si absente |
| `maxAge` | 7 jours (`auth.ts:83`) | Durée fixe de session |
| `httpOnly` | `true` (`auth.ts:84`) | Empêche l'accès JavaScript au cookie |
| `secure` | `true` en production (`auth.ts:85`) | Cookie transmis uniquement via HTTPS |
| `sameSite` | `"lax"` (`auth.ts:86`) | Permet les liens entrants (validation email) tout en protégeant contre CSRF |
| `resave` | `false` (`auth.ts:80`) | Évite les écritures inutiles en base |
| `saveUninitialized` | `false` (`auth.ts:81`) | Pas de sessions créées pour les visiteurs anonymes |

### Protection contre la fixation de session (`routes.ts:193-199`)

À la connexion (`POST /api/auth/login`), la session précédente est **régénérée** via `req.session.regenerate()` avant l'appel à `req.logIn()`. Un `try/catch` async/await gère proprement les erreurs de régénération et renvoie une erreur 500 sans détail technique.

```typescript
// routes.ts:193-199
try {
  await new Promise<void>((resolve, reject) =>
    req.session.regenerate((sessionErr) => (sessionErr ? reject(sessionErr) : resolve()))
  );
} catch {
  return res.status(500).json({ message: "Erreur de session" });
}
```

### Stratégie d'authentification (`auth.ts:94-122`)

Passport.js avec `LocalStrategy` :
- Email normalisé (`toLowerCase().trim()`) avant comparaison (`auth.ts:99`)
- Mot de passe vérifié avec `bcrypt.compare` (`auth.ts:105`)
- Comptes non-`ACTIVE` rejetés avec un message spécifique (`auth.ts:110-114`)
- Messages d'erreur identiques pour email inconnu et mot de passe incorrect : `"Email ou mot de passe incorrect"` (anti-énumération, `auth.ts:102,107`)

---

## 4. Protection des photos de profil

**Fichier** : `server/routes.ts` (lignes 25-49, 92-99, 276-346)

### Upload sécurisé

1. **Multer** (`routes.ts:37-49`) : limite de taille 5 Mo (`routes.ts:39`), extensions autorisées `.jpg`, `.jpeg`, `.png`, `.webp` (`routes.ts:41`)
2. **Noms de fichiers** (`routes.ts:31-34`) : remplacés par un UUID v4 + extension originale via `crypto.randomUUID()` — aucun nom utilisateur ni chemin d'origine
3. **Validation des magic bytes** (`routes.ts:92-99`) : la fonction `validateImageMagicBytes()` vérifie le type MIME réel du fichier via la bibliothèque `file-type` v21 (lecture des premiers octets). Si le contenu ne correspond pas à `image/jpeg`, `image/png` ou `image/webp`, le fichier est **supprimé du disque** (`fs.unlinkSync`) et une erreur 400 est renvoyée
4. **Double validation** : extension vérifiée par Multer à l'upload + magic bytes vérifiés après écriture sur disque (`routes.ts:130-136` pour register, `routes.ts:281-285` pour photo update)

### Accès aux photos (`routes.ts:323-346`)

Le dossier `uploads/` n'est **pas** servi par Express en tant que fichiers statiques. Aucun `express.static("uploads")` n'existe.

Les photos sont servies exclusivement par la route `GET /api/photos/:filename` (`routes.ts:331-346`) :

| Protection | Détail | Ligne |
|---|---|---|
| Authentification | `requireAuth` — seuls les utilisateurs connectés | `routes.ts:331` |
| Validation du nom | Regex `^[a-f0-9-]{36}\.(jpg\|jpeg\|png\|webp)$` — anti path-traversal | `routes.ts:323,333` |
| `X-Content-Type-Options` | `nosniff` — empêche le navigateur de deviner le type | `routes.ts:342` |
| `Cache-Control` | `private, max-age=3600` — pas de cache partagé | `routes.ts:343` |
| `Content-Disposition` | `inline` — affichage direct, pas de téléchargement | `routes.ts:344` |
| `Content-Type` | Déduit de l'extension (map `PHOTO_CONTENT_TYPES`, `routes.ts:324-329`) | `routes.ts:341` |

**Frontend** : `client/src/lib/photo-url.ts` — la fonction `getPhotoUrl()` convertit les chemins `/uploads/xxx` stockés en base en URLs `/api/photos/xxx` pour le navigateur.

### Suppression des fichiers sur disque

| Action | Fichier supprimé | Ligne |
|---|---|---|
| Suppression de photo (`DELETE /api/auth/me/photo`) | Ancienne photo | `routes.ts:307-309` |
| Remplacement de photo (`POST /api/auth/me/photo`) | Ancienne photo | `routes.ts:287-289` |
| Suppression de compte par admin (`DELETE /api/admin/users/:id`) | Photo du compte | `routes.ts:1081-1083` |
| Suppression de son propre compte | Photo du compte | (via la route de suppression de compte) |
| Échec de validation magic bytes | Fichier uploadé rejeté | `routes.ts:96` |

---

## 5. Sanitization des données utilisateur (RGPD)

**Fichier** : `server/routes.ts` (lignes 51-74)

Deux niveaux de sanitization pour contrôler les données personnelles exposées :

### `sanitizeUser(user)` — données propres (`routes.ts:51-54`)

**Champs retirés** : `password`, `validationToken`, `validationExpiry`

**Utilisé sur les routes** :
- `GET /api/auth/me` — profil propre de l'utilisateur
- `PATCH /api/auth/me` — mise à jour du profil
- `POST /api/auth/me/photo` — upload de photo (`routes.ts:293`)
- `DELETE /api/auth/me/photo` — suppression de photo (`routes.ts:312`)
- `GET /api/admin/users` — liste admin de tous les utilisateurs (`routes.ts:1041`)
- `PATCH /api/admin/users/:id/validate` — validation admin (`routes.ts:1056`)
- `PATCH /api/admin/users/:id/suspend` — suspension admin (`routes.ts:1069`)

### `sanitizeUserPublic(user)` — données inter-utilisateurs (`routes.ts:56-74`)

**Champs retirés en plus** : `phone`, `address`, `postalCode`, `trustedPersonName`, `trustedPersonEmail`, `referentEmail`, `referentTitle`, `referentFirstName`, `referentLastName`, `validatorEmail`

Ces champs constituent des données personnelles sensibles (contact, adresse, personnes de confiance/référentes) qui ne doivent pas être visibles par les autres utilisateurs.

**Utilisé sur les routes** :
- `GET /api/matching/suggestions` — profils suggérés (`routes.ts:518`)
- `GET /api/relations` — données senior/junior des relations (`routes.ts:537-538`)
- `GET /api/relations/:id` — données senior/junior d'une relation (`routes.ts:559-560`)

### Données jamais envoyées au frontend

Le champ `password` (hash bcrypt) est retiré par les deux fonctions. Il n'est **jamais** inclus dans aucune réponse API.

---

## 6. Validation des entrées

### Schémas Zod (`shared/schema.ts`)

Toutes les routes qui reçoivent un body utilisent un schéma Zod :

| Schéma | Route | Validation notable | Ligne |
|---|---|---|---|
| `insertUserSchema` | `POST /api/auth/register` | Anti auto-validation (`validatorEmail ≠ email`), domaines freemail bloqués pour validateurs Junior en prod | `schema.ts:147-157` |
| `loginSchema` | `POST /api/auth/login` | Email valide, mot de passe min 6 caractères | `schema.ts:94-97` |
| `changePasswordSchema` | `PATCH /api/auth/me/password` | Ancien et nouveau mot de passe min 6 caractères | `schema.ts:212-215` |
| `updateProfileSchema` | `PATCH /api/auth/me` | Champs optionnels, bio max 500 caractères | `schema.ts:176-194` |
| `createRelationSchema` | `POST /api/relations` | `juniorId` requis et non vide | `schema.ts:172-174` |
| `insertInterventionSchema` | `POST /api/relations/:id/interventions` | Date requise, durée 30-480 minutes | `schema.ts:159-165` |
| `feedbackSchema` | `POST /api/interventions/:id/feedback` | Note 1-5, commentaire max 1000 caractères | `schema.ts:167-170` |
| `createPaymentSchema` | `POST /api/admin/payments` | Montant positif, libellé requis | `schema.ts:205-210` |
| `createAdminSchema` | `POST /api/admin/create-admin` | Email valide, mot de passe min 6 caractères | `schema.ts:217-222` |

### Validation des contenus messages

`POST /api/messages/conversations/:id` : le contenu est validé côté route (string non vide, max 2000 caractères).

### Pattern de validation dans les routes

Chaque route utilise `.safeParse()` et renvoie un 400 avec les erreurs Zod aplaties :

```typescript
const parsed = monSchema.safeParse(req.body);
if (!parsed.success) {
  return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
}
```

---

## 7. Matrice d'autorisations et contrôle d'accès

### Middlewares (`auth.ts:141-156`)

| Middleware | Vérifie | Code HTTP si échec |
|---|---|---|
| `requireAuth` (`auth.ts:141-146`) | `req.isAuthenticated()` | 401 |
| `requireAdmin` (`auth.ts:148-156`) | `req.isAuthenticated()` ET `req.user.role === "ADMIN"` | 401 ou 403 |

### Matrice des autorisations par route

**Légende** : `●` = autorisé, `○` = interdit, `◐` = conditionnel

#### Auth & Compte

| Route | Anonyme | Senior | Junior | Admin | Condition |
|---|---|---|---|---|---|
| `POST /api/auth/register` | ● | ● | ● | ● | Rate limited (5/h) |
| `POST /api/auth/login` | ● | ● | ● | ● | Rate limited (10/15min) |
| `POST /api/auth/logout` | ● | ● | ● | ● | |
| `GET /api/auth/me` | ○ | ● | ● | ● | |
| `PATCH /api/auth/me` | ○ | ● | ● | ● | Propre profil uniquement |
| `PATCH /api/auth/me/password` | ○ | ● | ● | ● | Propre profil uniquement |
| `POST /api/auth/me/photo` | ○ | ● | ● | ● | Propre profil uniquement |
| `DELETE /api/auth/me/photo` | ○ | ● | ● | ● | Propre profil uniquement |
| `POST /api/auth/resend-validation` | ● | ● | ● | ● | Pas de rate limiting (voir M2) |
| `GET /api/validate` | ● | ● | ● | ● | Token valide requis |
| `GET /api/photos/:filename` | ○ | ● | ● | ● | Nom de fichier validé par regex |

#### Matching & Relations

| Route | Anonyme | Senior | Junior | Admin | Condition |
|---|---|---|---|---|---|
| `GET /api/matching/suggestions` | ○ | ● | ● | ○ | Réponse via `sanitizeUserPublic` |
| `POST /api/relations` | ○ | ● | ○ | ○ | Senior uniquement (`routes.ts:571`) |
| `PATCH /api/relations/:id/accept` | ○ | ○ | ◐ | ○ | Junior destinataire uniquement (`routes.ts:618`) |
| `PATCH /api/relations/:id/reject` | ○ | ○ | ◐ | ○ | Junior destinataire uniquement (`routes.ts:659`) |
| `PATCH /api/relations/:id/close` | ○ | ◐ | ◐ | ● | Participant ou Admin (`routes.ts:690`) |
| `GET /api/relations` | ○ | ● | ● | ● | Propres relations uniquement |
| `GET /api/relations/:id` | ○ | ◐ | ◐ | ● | Participant ou Admin (`routes.ts:554`) |

#### Interventions

| Route | Anonyme | Senior | Junior | Admin | Condition |
|---|---|---|---|---|---|
| `POST /api/relations/:id/interventions` | ○ | ◐ | ○ | ◐ | Si `PENDING_FIRST_MEETING` : Admin seul (`routes.ts:726`). Si `ACTIVE` : Senior ou Admin (`routes.ts:730`) |
| `PATCH /api/interventions/:id/confirm` | ○ | ○ | ◐ | ○ | Junior de la relation (`routes.ts:790`) |
| `PATCH /api/interventions/:id/done` | ○ | ○ | ○ | ● | Admin uniquement |
| `PATCH /api/interventions/:id/cancel` | ○ | ◐ | ○ | ● | Senior de la relation ou Admin |
| `POST /api/interventions/:id/feedback` | ○ | ◐ | ◐ | ○ | Participant, et seulement s'il n'a pas déjà noté |

#### Messagerie

| Route | Anonyme | Senior | Junior | Admin | Condition |
|---|---|---|---|---|---|
| `GET /api/messages/conversations` | ○ | ● | ● | ● | Propres conversations uniquement |
| `GET /api/messages/conversations/:id` | ○ | ◐ | ◐ | ○ | Participant uniquement, relation ACTIVE |
| `POST /api/messages/conversations/:id` | ○ | ◐ | ◐ | ○ | Participant uniquement, relation ACTIVE |
| `PATCH /api/messages/conversations/:id/read` | ○ | ◐ | ◐ | ○ | Participant uniquement |
| `GET /api/messages/stream` (SSE) | ○ | ● | ● | ● | Connexion persistante |

#### Administration

| Route | Anonyme | Senior | Junior | Admin | Condition |
|---|---|---|---|---|---|
| `GET /api/admin/users` | ○ | ○ | ○ | ● | Renvoie `sanitizeUser` (pas le mot de passe) |
| `PATCH /api/admin/users/:id/validate` | ○ | ○ | ○ | ● | Compte `PENDING_VALIDATION` uniquement |
| `PATCH /api/admin/users/:id/suspend` | ○ | ○ | ○ | ● | Impossible sur un ADMIN (`routes.ts:1067`) |
| `DELETE /api/admin/users/:id` | ○ | ○ | ○ | ● | Impossible sur un ADMIN (`routes.ts:1080`) |
| `POST /api/admin/create-admin` | ○ | ○ | ○ | ● | |
| `GET /api/admin/relations` | ○ | ○ | ○ | ● | |
| `GET /api/admin/relations/pending-meeting` | ○ | ○ | ○ | ● | |
| `GET /api/admin/interventions` | ○ | ○ | ○ | ● | |
| `POST /api/admin/recommendations` | ○ | ○ | ○ | ● | |
| `DELETE /api/admin/recommendations/:id` | ○ | ○ | ○ | ● | |
| `GET /api/admin/payments` | ○ | ○ | ○ | ● | |
| `POST /api/admin/payments` | ○ | ○ | ○ | ● | |
| `GET /api/admin/messages/conversations` | ○ | ○ | ○ | ● | |
| `GET /api/admin/messages/conversations/:id` | ○ | ○ | ○ | ● | |
| `DELETE /api/admin/messages/:messageId` | ○ | ○ | ○ | ● | Soft delete (`isDeleted: true`) |

**Protections admin** :
- Un admin ne peut pas suspendre un autre admin (`routes.ts:1067` : `if (user.role === "ADMIN") return 403`)
- Un admin ne peut pas supprimer un autre admin (`routes.ts:1080` : `if (user.role === "ADMIN") return 403`)

---

## 8. Logging et informations exposées

**Fichier** : `server/index.ts` (lignes 66-90)

### Logs de requêtes API (`index.ts:77-86`)

- En **développement** : méthode, path, status code, durée + body JSON de la réponse
- En **production** : méthode, path, status code, durée **uniquement** — les corps de réponse ne sont **pas** loggés (`index.ts:81` : `process.env.NODE_ENV !== "production"`)

### Tokens de validation

Les liens de validation (contenant le token UUID) sont loggés dans la console **uniquement en développement** :
- À l'inscription : `routes.ts:166-168`
- Au renvoi de validation : `routes.ts:486-488`

### Anti-énumération

- `POST /api/auth/login` : message identique pour email inconnu et mot de passe incorrect (`auth.ts:102,107`)
- `POST /api/auth/resend-validation` : renvoie **toujours** un 200 avec le même message, que le compte existe ou non (`routes.ts:498,501`)

### Erreurs serveur

- Les stack traces ne sont **jamais** envoyées dans les réponses HTTP
- Les messages d'erreur sont génériques côté client ("Erreur interne", "Identifiants incorrects")
- Les erreurs détaillées sont loguées côté serveur uniquement (`console.error`)

---

## 9. Décisions de sécurité documentées

| Décision | Justification |
|---|---|
| `sameSite: "lax"` (pas `"strict"`) | Les liens de validation d'inscription proviennent d'emails (domaine externe Brevo). `strict` empêcherait la navigation avec le cookie de session depuis ces liens |
| CSP désactivée en dev | Vite injecte des scripts et styles inline pour le hot-reload. Une CSP stricte casserait le développement |
| Mot de passe min 6 caractères | Compromis UX pour le public senior. Un minimum plus élevé augmenterait les abandons à l'inscription. Le hash bcrypt (10 rounds) compense partiellement |
| Rate limiting sur IP uniquement | Le volume attendu de l'application (quelques dizaines d'utilisateurs en Guadeloupe) ne justifie pas un rate limiting par couple IP+email |
| Photos accessibles à tout utilisateur authentifié | Le matching affiche les photos de profil avant toute relation. Restreindre l'accès aux seules relations casserait la fonctionnalité de découverte |
| `createTableIfMissing: true` pour la table de sessions | Simplifie le déploiement initial. La table `session` est créée automatiquement par `connect-pg-simple` si absente |
| Pas de CORS explicite | Non nécessaire — le frontend et le backend sont servis sur le même domaine/port (Express sert les fichiers statiques Vite en production) |
| Clé publique VAPID accessible sans auth | Par conception — la clé publique est nécessaire côté client pour initier l'abonnement aux notifications push avant l'authentification |

---

## 10. Vulnérabilités résiduelles connues

### Sévérité MEDIUM

| ID | Description | Fichier/Ligne | Impact | Recommandation |
|---|---|---|---|---|
| M1 | Le champ `validationExpiry` n'est jamais renseigné à l'inscription (`routes.ts:139-153`). Le token de validation reste valide **indéfiniment** | `routes.ts:139-153` | Un token de validation intercepté (email compromis) pourrait être utilisé des mois plus tard pour activer un compte | Renseigner `validationExpiry` à `new Date(Date.now() + 48 * 60 * 60 * 1000)` lors de la création du token, et vérifier l'expiration dans `GET /api/validate` (`routes.ts:421-442`) |
| M2 | La route `POST /api/auth/resend-validation` n'a **aucun rate limiting** | `routes.ts:467` | Un attaquant pourrait spammer des emails de validation vers l'adresse du référent. Le coût Brevo augmenterait et le référent serait inondé d'emails | Ajouter un rate limiter (ex: 3 requêtes / heure par IP) |
| M3 | Le mot de passe minimum est de 6 caractères | `shared/schema.ts:122` | Mots de passe faibles potentiellement vulnérables au brute-force offline si la base est compromise. Compromis UX **volontaire** pour le public senior | Envisager un indicateur visuel de force de mot de passe côté frontend sans augmenter le minimum |

### Sévérité LOW

| ID | Description | Fichier/Ligne | Impact | Recommandation |
|---|---|---|---|---|
| L1 | La taille du body JSON n'est pas **explicitement** limitée (Express utilise le défaut de 100 Ko) | `server/index.ts:19-24` | Le défaut Express (100 Ko) est raisonnable, mais non documenté dans le code | Ajouter `limit: '100kb'` à `express.json()` pour rendre l'intention explicite |
| L2 | L'en-tête `Permissions-Policy` n'est pas configuré | `server/index.ts:28-51` | Les APIs navigateur (géolocalisation, caméra, microphone) ne sont pas explicitement restreintes | Ajouter un middleware : `res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')` |
| L3 | Pas de timeout d'inactivité de session (durée fixe de 7 jours) | `server/auth.ts:83` | Un utilisateur reste connecté 7 jours même sans activité. Si un appareil est partagé, un autre utilisateur pourrait accéder au compte | Envisager `rolling: true` avec un `maxAge` adapté, ou un middleware de timeout d'inactivité |
| L4 | L'endpoint de souscription push n'est pas validé comme URL | `routes.ts:1370-1381` | Un attaquant authentifié pourrait stocker une URL arbitraire comme endpoint push. Impact limité car `web-push` échouera silencieusement sur les URLs invalides | Valider que `endpoint` est une URL HTTPS valide (ex: `new URL(endpoint).protocol === 'https:'`) |
| L5 | La route admin messages contourne la couche `IStorage` avec un import direct de Prisma | `routes.ts:1396-1446` | Viole le pattern architectural. Rend le code plus difficile à maintenir et à tester | Créer une méthode `getConversationWithMessages()` dans `IStorage` et l'utiliser dans la route |

### Sévérité INFO

| ID | Description | Notes |
|---|---|---|
| I1 | `sameSite: "lax"` au lieu de `"strict"` | Décision documentée — nécessaire pour les liens de validation email depuis un domaine externe |
| I2 | CORS non configuré explicitement | Non nécessaire — même domaine/port pour frontend et backend |
| I3 | La clé publique VAPID est accessible sans authentification (`GET /api/push/vapid-key`) | Par conception — la clé publique est requise côté client pour l'abonnement push |
| I4 | `createTableIfMissing: true` dans la configuration de session (`auth.ts:77`) | Simplifie le déploiement, mais en production il serait préférable de créer la table via migration SQL |

---

## 11. Dépendances de sécurité

Versions actuelles des packages liés à la sécurité :

| Package | Version | Rôle |
|---|---|---|
| `helmet` | 8.1.0 | En-têtes de sécurité HTTP |
| `express-rate-limit` | 8.3.1 | Limitation de débit sur les routes sensibles |
| `bcryptjs` | 3.0.3 | Hashing des mots de passe (10 rounds) |
| `passport` | 0.7.0 | Framework d'authentification |
| `express-session` | 1.18.2 | Gestion des sessions |
| `connect-pg-simple` | 10.0.0 | Store de sessions PostgreSQL |
| `multer` | 2.1.1 | Upload de fichiers avec limites de taille |
| `file-type` | 21.3.1 | Détection du type MIME réel (magic bytes) |

**Recommandation** : exécuter `npm audit` régulièrement et mettre à jour les dépendances avec `npm update`.

---

## 12. Guide sécurité pour les contributeurs

### Règles obligatoires

1. **Ne jamais renvoyer le mot de passe** : toujours utiliser `sanitizeUser()` ou `sanitizeUserPublic()` avant de renvoyer un objet utilisateur dans une réponse API
2. **Toujours valider les entrées** : chaque route POST/PATCH/PUT doit utiliser un schéma Zod de `shared/schema.ts` avec `.safeParse()` et renvoyer les erreurs
3. **Utiliser les middlewares d'auth** : toute nouvelle route doit être protégée par `requireAuth` ou `requireAdmin` sauf si elle est intentionnellement publique
4. **Passer par IStorage** : ne jamais importer `prisma` directement dans `routes.ts`. Toutes les opérations DB passent par `server/storage.ts`
5. **Photos via getPhotoUrl()** : côté frontend, toujours utiliser `getPhotoUrl()` de `client/src/lib/photo-url.ts` pour afficher les photos de profil
6. **Pas de données sensibles dans les logs** : ne jamais logger des mots de passe, tokens, ou données personnelles. Les tokens de validation ne sont loggés qu'en `NODE_ENV !== 'production'`

### Checklist pour une nouvelle route

- [ ] Middleware d'auth approprié (`requireAuth` ou `requireAdmin`)
- [ ] Validation Zod du body si applicable
- [ ] Contrôle d'accès métier (propriétaire, participant, etc.)
- [ ] Utilisation de `sanitizeUser()` ou `sanitizeUserPublic()` si un objet utilisateur est renvoyé
- [ ] Messages d'erreur génériques (pas de détails techniques côté client)
- [ ] Opérations DB via `IStorage` uniquement

### Checklist pour l'upload de fichiers

- [ ] Limite de taille via Multer
- [ ] Validation de l'extension
- [ ] Validation des magic bytes via `validateImageMagicBytes()`
- [ ] Nom de fichier remplacé par un UUID
- [ ] Suppression du fichier en cas d'échec ou de remplacement
