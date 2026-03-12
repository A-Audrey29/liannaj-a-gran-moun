# Architecture — FEVES

## Vue d'ensemble

FEVES est une application web **full-stack TypeScript** avec une architecture monorepo :

- Le **backend** Express sert à la fois l'API JSON et le frontend compilé (SPA React).
- En développement, Vite est monté comme middleware dans Express (hot reload intégré).
- En production, Express sert les fichiers statiques compilés par Vite.

```
Navigateur
    │
    ▼
Express (port 5000)
    ├── /api/*              → Routes API (JSON)
    ├── /api/photos/:filename → Photos de profil (auth requise)
    └── /*                  → Frontend React (SPA)
            │
            └── TanStack Query → appels /api/*
```

> **Note sécurité** : Le dossier `uploads/` n'est **pas** servi publiquement. Les photos de profil sont accessibles uniquement via `/api/photos/:filename` qui exige une session authentifiée, valide le nom de fichier (regex anti path-traversal), et renvoie les en-têtes de sécurité appropriés (`X-Content-Type-Options: nosniff`, `Cache-Control: private`).

---

## Stack technique

| Couche | Technologie | Rôle |
|---|---|---|
| Backend | Express.js + TypeScript | Serveur HTTP, routes API |
| Frontend | React + Vite + TypeScript | Interface utilisateur SPA |
| Routing frontend | Wouter | Navigation côté client |
| ORM | Prisma 7 | Accès PostgreSQL type-safe |
| Auth | Passport.js (LocalStrategy) | Authentification email/password |
| Sessions | connect-pg-simple | Sessions stockées en PostgreSQL |
| UI | Tailwind CSS + Shadcn/UI | Composants et styles |
| Data fetching | TanStack Query v5 | Cache, invalidation, états chargement |
| Validation | Zod | Validation des données (front + back) |
| Email | Brevo API (fetch direct) | Emails transactionnels |
| Temps réel | SSE (Server-Sent Events) | Messages en temps réel |
| Push | Web Push API + VAPID | Notifications push PWA |

---

## Système d'authentification

L'authentification repose sur **Passport.js** avec la stratégie locale (email + mot de passe hashé avec bcrypt).

**Flux de connexion :**
1. `POST /api/auth/login` → Passport vérifie email/password dans la DB
2. La session précédente est **régénérée** (`req.session.regenerate`) pour prévenir la fixation de session
3. Le navigateur reçoit un cookie de session (`connect.sid`, `httpOnly`, `sameSite: lax`)
4. Chaque requête authentifiée envoie ce cookie → `requireAuth` middleware valide la session

**Flux d'inscription :**
1. L'utilisateur soumet le formulaire → compte créé en statut `PENDING_VALIDATION`
2. Un email est envoyé à l'**email du référent** (≠ email utilisateur) avec un lien de validation
3. Clic sur le lien → `GET /api/validate?token=xxx` → statut passe à `ACTIVE`
4. L'utilisateur peut alors se connecter

**Middlewares d'auth :**
- `requireAuth` — vérifie `req.isAuthenticated()`
- `requireAdmin` — vérifie `req.user.role === "ADMIN"`

**Protections :**
- **Rate limiting** : login limité à 10 tentatives / 15 min par IP, inscription à 5 / heure
- **Helmet** : en-têtes de sécurité HTTP (CSP stricte en production uniquement)
- **Validation des images** : vérification des magic bytes (pas seulement l'extension) lors de l'upload
- **Sanitization** : les données sensibles (téléphone, adresse, personnes de confiance) sont retirées des réponses inter-utilisateurs via `sanitizeUserPublic`

---

## Système de rôles

| Rôle | Affichage UI | Permissions principales |
|---|---|---|
| `ADMIN` | Admin | Accès total : valider comptes, créer 1ère rencontre, modérer messages, gérer paiements |
| `SENIOR` | Senior | Initier relations, proposer rencontres, envoyer messages (si relation ACTIVE) |
| `JUNIOR` | Jeune | Accepter/refuser relations, confirmer rencontres, envoyer messages (si relation ACTIVE) |

> **Important** : Dans le code et la base de données, le terme utilisé est `JUNIOR`. Dans l'interface utilisateur, on affiche toujours **"Jeune"**.

---

## Temps réel — SSE (Server-Sent Events)

Les messages de la messagerie interne sont mis à jour en temps réel via **SSE**.

**Fonctionnement :**
1. Quand l'utilisateur se connecte, le frontend ouvre une connexion persistante : `GET /api/messages/stream`
2. Le serveur garde cette connexion ouverte et y pousse des événements JSON
3. Le hook `use-sse.ts` écoute ces événements et **invalide le cache TanStack Query** pour déclencher un re-fetch automatique

**Événements SSE :**

| Événement | Déclenché quand | Effet côté client |
|---|---|---|
| `new_message` | Un message est reçu | Invalide conversations + messages + compteur non lus |
| `message_sent` | Le message de l'utilisateur est envoyé | Invalide conversations + messages (pas le compteur) |
| `messages_read` | L'interlocuteur a lu les messages | Invalide les messages de la conversation |
| `message_deleted` | Un admin supprime un message | Invalide les messages de la conversation |

> **Règle importante** : `message_sent` n'invalide pas le compteur de messages non lus, pour ne pas faire monter le badge de l'expéditeur.

---

## Cycle de vie d'une relation

Une relation est le lien entre un Senior et un Jeune. Elle passe par plusieurs statuts :

```
PENDING
  │  Senior envoie une demande de relation
  │
  ▼
  Junior accepte → PENDING_FIRST_MEETING
  Junior refuse  → CLOSED
  │
  ▼
PENDING_FIRST_MEETING
  │  L'admin organise la première rencontre (Intervention)
  │  L'admin valide la rencontre comme DONE
  │
  ▼
ACTIVE  ←── La messagerie devient disponible ici
  │  Senior et Junior peuvent proposer/confirmer des rencontres
  │  Les deux peuvent se contacter par messages
  │
  ▼
CLOSED  (par l'un ou l'autre, ou par l'admin)
```

**Règle du cadrage :**
- La **première intervention** d'une relation ne peut être créée que par un **admin**
- Une fois cette intervention validée (`DONE`), la relation passe automatiquement à `ACTIVE`
- Après cela, **le Senior propose** les rencontres suivantes, et le Junior les confirme

---

## Cycle de vie d'une intervention (rencontre)

```
PROPOSED
  │  Créée par Admin (1ère) ou Senior (suivantes)
  │
  ▼
CONFIRMED
  │  Junior confirme sa présence
  │
  ▼
DONE
  │  Admin valide que la rencontre a eu lieu
  │
  ▼
COMPLETED_PENDING_FEEDBACK
  │  Les deux participants doivent noter la rencontre (1-5 étoiles)
  │
  ▼
COMPLETED
  │  Les deux ont soumis leur feedback

CANCELLED  (à tout moment par Senior ou Admin)
```

---

## Messagerie interne

- Une **Conversation** est créée automatiquement quand une relation passe à `ACTIVE`
- Chaque Conversation est liée à une seule Relation (`1:1`)
- La messagerie n'est accessible que pour les relations `ACTIVE` (pas PENDING, CLOSED, etc.)
- Les **messages supprimés** par un admin restent en base (`isDeleted: true`, `deletedByAdmin: true`) — soft delete
- L'admin peut lire **toutes** les conversations

---

## Notifications push (PWA)

- Utilise la **Web Push API** avec des clés VAPID
- Si les variables `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` ne sont pas configurées, le système est désactivé **silencieusement** (pas d'erreur)
- Les souscriptions push sont stockées en base (modèle `PushSubscription`)
- Les notifications push sont envoyées quand un message est reçu **et que le destinataire n'est pas connecté en SSE**

---

## Points d'attention critiques

1. **Ne pas modifier `vite.config.ts` ni `server/vite.ts`** — la configuration Vite est préconfigurée
2. **Ne pas modifier `package.json` directement** — utiliser les outils d'installation de packages
3. **Toujours passer par l'interface `IStorage`** dans `server/storage.ts` pour toutes les opérations DB
4. **Les types partagés sont dans `shared/schema.ts`** — jamais d'import direct de Prisma côté client
5. **Le client Prisma généré est dans `generated/prisma/`** — ne pas modifier ce dossier
