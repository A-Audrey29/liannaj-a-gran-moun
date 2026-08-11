# Liannaj — Ajouter les disponibilités (récurrentes + ponctuelles)

> **État au 2026-08-11 — plan entièrement livré, et dépassé sur un point.**
>
> Commits `efcd96f` (socle dispos) et `fedaaec` (blocage dur + grille) sur
> `feature/disponibilites-junior`.
>
> **La question ouverte en bas de ce document est tranchée** : le Senior ne peut
> plus proposer hors des créneaux déclarés. Le blocage est dur, côté serveur
> (400) *et* côté UI (plus de saisie libre de date). L'étape 7 disait l'inverse
> (« ne pas modifier le formulaire de proposition en V1 ») — cette consigne est
> caduque.
>
> Écarts avec le plan, décidés en cours de route :
> - **Trois** chemins de création à protéger, pas deux : `POST /api/referent/interventions`
>   ([server/routes.ts](../server/routes.ts)) permet au Référent de proposer au nom
>   du Senior. Non repéré au moment du plan.
> - `dates.ts` et la fusion de créneaux vivent dans `shared/` (et non `server/lib/`),
>   pour que client et serveur partagent une seule implémentation.
> - Deux impasses corrigées : 403 du Senior pendant `PENDING_FIRST_MEETING`,
>   et Référent sans accès aux dispos qu'il doit respecter.
>
> **`prisma db push` reste à faire** : la table `Availability` n'existe pas encore
> en base.

## Context

Objectif initial : « récupérer la fonctionnalité de réservation d'Asanblé pour Liannaj ».
La lecture du code a invalidé deux prémisses du plan précédent — d'où ce plan réécrit.

**Découverte 1 — la stack n'est pas celle d'Asanblé.**

| | Asanblé | Liannaj |
|---|---|---|
| Framework | Next.js 15 App Router | Express 5 + Vite + React 18 |
| ORM | Drizzle | **Prisma 7** |
| Routing | App Router | wouter (client-side) |
| Auth | Better Auth | Passport.js + express-session |
| Zod | v4 | **v3** |
| Structure | `/app` + `/server` | `/client` + `/server` + `/shared` |

Conséquence : le code Drizzle d'Asanblé n'est **pas** copiable. Les 240 lignes de
mutations, le schéma et l'UI sont à réécrire pour Prisma/Express/wouter.

**Découverte 2 — Liannaj a DÉJÀ la réservation.**

Le modèle `Intervention` ([prisma/schema.prisma:168-189](prisma/schema.prisma)) porte
`scheduledDate`, `durationMinutes`, `location`, `status`
(`PROPOSED → CONFIRMED → CANCELLED/DONE/COMPLETED`), + feedback bilatéral.
Flux complet en production :
- `POST /api/relations/:relationId/interventions` — le Senior propose ([server/routes.ts:762](server/routes.ts))
- `PATCH /api/interventions/:id/confirm` — le Junior confirme ([server/routes.ts:828](server/routes.ts))
- notification in-app + email à chaque étape
- 10 méthodes `Intervention` dans [server/storage.ts](server/storage.ts)

**Ce qui manque réellement : les disponibilités.** Grep exhaustif sur `server/`,
`shared/`, `prisma/schema.prisma` → **zéro** notion de créneau, récurrence ou exception.
Aujourd'hui le Senior propose une date à l'aveugle.

**Le travail réel = ajouter les dispos, sans toucher à `Intervention`.**

## Décisions actées par Audrey

| Sujet | Décision |
|---|---|
| Qui déclare | **Le Junior** déclare ses dispos |
| Qui consulte | **Senior + Admin** (le prof/TEACHER plus tard) |
| Intégration | **`Availability` seule** — `Intervention` strictement inchangée |
| Traçabilité | Pas de lien `availabilityId` : l'historique est déjà dans `Intervention` |
| Fuseau | Guadeloupe (seed : Les Abymes, Pointe-à-Pitre) → `dates.ts` copiable tel quel |

*Pourquoi pas de lien vers `Availability`* : un créneau n'est pas stable — le découpage
d'exceptions et la réédition de planning soft-suppriment et recréent des lignes. Un
`availabilityId` pointerait souvent vers une ligne morte : un lien qui semble fiable
sans l'être. L'historique des rencontres (`scheduledDate`, `status`, feedback) est déjà
intégralement dans `Intervention`. Si la traçabilité devient un besoin, la version
robuste sera une **copie figée** du créneau (`slotStartAt`/`slotEndAt`), pas un ID.

---

## Ce qui est repris d'Asanblé

**Copiable tel quel** : `server/lib/dates.ts` (122 l., fonctions pures, zéro dépendance,
Guadeloupe UTC-4). Vient d'être déplacé vers `/server/lib` dans Asanblé (commit `3356972`).

**Repris comme logique, réécrit en Prisma** — les pièges déjà payés en prod :
- **Découpage d'exceptions** : une indispo 10h-11h sur un créneau 9h-12h doit produire
  9h-10h **+** 11h-12h (`provider-availability.ts:111-122` côté Asanblé)
- **Protection des réservations** : rééditer un planning récurrent ne doit jamais
  détruire un créneau portant une intervention confirmée (`:190-196`)
- **Purge = source de vérité** : la fenêtre récurrente remplace l'existant non protégé (`:172-240`)
- **Chevauchement** : autorisé en base, **fusionné à l'affichage** (interdire en base
  casserait le découpage)

**Non repris** : schéma Drizzle, mutations Drizzle, UI Next/React 19, machine à états
(celle d'`Intervention` existe et suffit).

---

## Plan

### Étape 1 — Modèle `Availability` (Prisma)

Ajouter dans [prisma/schema.prisma](prisma/schema.prisma), en suivant les conventions
du fichier (`cuid()`, `@@index`, relation nommée sur `User`) :

```prisma
enum AvailabilityKind {
  AVAILABLE
  UNAVAILABLE
}

model Availability {
  id        String           @id @default(cuid())
  userId    String
  user      User             @relation("UserAvailabilities", fields: [userId], references: [id], onDelete: Cascade)
  startAt   DateTime
  endAt     DateTime
  kind      AvailabilityKind @default(AVAILABLE)
  deletedAt DateTime?        // soft delete — requis par le découpage
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  @@index([userId, startAt])
  @@index([startAt])
}
```

+ une ligne `availabilities Availability[] @relation("UserAvailabilities")` sur `User`.

**`deletedAt` est structurant** : le découpage d'exceptions et la purge récurrente
soft-suppriment. Sans lui, la protection des créneaux réservés est impossible.

Migration : `npx prisma db push` (script `db:push` existant) — **uniquement après GO
explicite d'Audrey**. Additif pur : nouvelle table + nouvel enum, aucune table existante
modifiée, donc aucun risque sur les données en prod.

### Étape 2 — Helpers dates

Copier `server/lib/dates.ts` d'Asanblé → `server/lib/dates.ts` dans Liannaj.
Copie littérale, y compris l'en-tête documentant le périmètre Guadeloupe.
Aucun import à adapter (module autonome).

*Note* : Liannaj utilise `toLocaleDateString("fr-FR")` sans `timeZone` explicite
([routes.ts:805](server/routes.ts) et 6 autres). Même dette latente qu'Asanblé, sans
impact tant que les utilisateurs sont en Guadeloupe. **Hors périmètre** — ne pas corriger ici.

### Étape 3 — Validations Zod (`shared/schema.ts`)

Ajouter à la suite d'`insertInterventionSchema` ([shared/schema.ts:234](shared/schema.ts)),
en suivant le style du fichier (`z.object`, export du type via `z.infer`) :
- `createAvailabilitySchema` — `startAt`, `endAt`, `kind`, avec refine `endAt > startAt`
- `createDateExceptionSchema` — `date` ISO, `kind`, `startTime`/`endTime` optionnels "HH:MM",
  refine : les deux fournis ou aucun
- `createRecurringAvailabilitiesSchema` — matrice 7 jours × plages, fenêtre `from`/`to`
- types exportés : `InsertAvailability`, etc.

**Zod v3, pas v4.** Les schémas d'Asanblé utilisent `z.coerce.date()` et `.refine()` —
disponibles en v3, mais à vérifier à l'écriture plutôt qu'à copier à l'aveugle.

### Étape 4 — Couche storage (`server/storage.ts`)

Ajouter à `IStorage` + implémentation, en suivant le style Prisma du fichier
(`prisma.x.findMany`, `include`, `orderBy`) :
- `getAvailabilitiesByUser(userId)` — actives, triées par `startAt`
- `getAvailabilitiesInRange(userId, from, to)` — chevauchant la fenêtre
- `createAvailability(data)` / `createManyAvailabilities(data[])`
- `softDeleteAvailabilities(ids)`
- `getConfirmedInterventionsForUser(userId, from?, to?)` — **la fonction pivot**

**`getConfirmedInterventionsForUser` est le cœur de la protection.** Elle remonte les
interventions `CONFIRMED` du Junior via `Relation.juniorId`, avec `scheduledDate` +
`durationMinutes` → intervalle `[start, start + duration]`. C'est elle qui empêche la
purge récurrente de détruire un créneau réservé.

### Étape 5 — Logique dispos (`server/lib/availability.ts`, nouveau)

Porter la logique d'Asanblé en Prisma. Trois fonctions :
- `createRecurringAvailabilities` — déploie la matrice hebdo en créneaux datés sur
  [from, to]. Purge d'abord l'existant `AVAILABLE` **non protégé** par une intervention
  confirmée, puis génère.
- `createDateException` — pose une exception ; si `UNAVAILABLE`, soft-supprime les
  créneaux chevauchants non protégés **et réinsère les fragments** avant/après quand
  l'exception est partielle (le découpage).
- `deleteAvailability` — soft delete avec vérification d'appartenance (`userId`).

Helper commun : `overlaps(aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart`.

### Étape 6 — Routes Express (`server/routes.ts`)

Suivre le style existant : `requireAuth`, `safeParse` + 400 sur erreur, try/catch + 500.

| Route | Qui | Rôle |
|---|---|---|
| `GET /api/availabilities/me` | Junior | ses créneaux |
| `POST /api/availabilities` | Junior | créneau unique |
| `POST /api/availabilities/recurring` | Junior | planning hebdo |
| `POST /api/availabilities/exception` | Junior | exception ponctuelle |
| `DELETE /api/availabilities/:id` | Junior | soft delete |
| `GET /api/users/:juniorId/availabilities` | Senior + Admin | consulter, **fusionnées** |

**Sécurité — trois règles non négociables :**
- `userId` **toujours** depuis `req.user!.id`, **jamais** depuis le body (le pattern
  du projet, cf. [routes.ts:775](server/routes.ts))
- routes d'écriture : rôle `JUNIOR` uniquement + appartenance vérifiée sur le `:id`
- `GET /api/users/:juniorId/availabilities` : autoriser seulement si `ADMIN`, ou Senior
  **lié au Junior par une `Relation` active** — sinon n'importe quel Senior lit le
  planning de n'importe quel Junior

### Étape 7 — UI

- **Junior** : page « Mes disponibilités » — onglets Récurrent / Exceptions.
  Réécriture React 18 + TanStack Query (`useMutation` + `invalidateQueries`), wouter
  pour la route. Radix déjà présent (`tabs`, `checkbox`, `select`, `dialog`).
  La version Asanblé (843 l.) sert de **référence de mise en page**, pas de source.
- **Senior / Admin** : vue lecture des créneaux du Junior, **fusionnés** (tri par
  `startAt` puis fusion des intervalles qui se touchent, ~30 lignes).
- Ne **pas** modifier le formulaire de proposition d'intervention en V1 : afficher les
  dispos à côté suffit. Contraindre la proposition aux créneaux déclarés est une
  décision produit à part, à trancher plus tard.

---

## Estimation

| Étape | Nature | Effort |
|---|---|---|
| 1 — modèle Prisma | neuf | ~0,5j |
| 2 — dates.ts | **copie** | ~0 |
| 3 — validations Zod | port v4→v3 | ~0,5j |
| 4 — storage | neuf (Prisma) | ~1j |
| 5 — logique dispos | **port de la logique Asanblé** | ~1,5j |
| 6 — routes | neuf (Express) | ~1j |
| 7 — UI | réécriture React 18 | ~2j |

**~6,5 jours.** Le gain vs from-scratch total n'est pas dans le code copié (quasi nul
hors `dates.ts`) mais dans **les pièges déjà connus** : découpage, protection des
réservations, chevauchement, exclusion des créneaux pris. Ce sont des bugs qu'on ne
découvrira pas en prod.

---

## Vérification

1. `npx tsc` (script `check`) vert, `npm run build` vert — **avant** tout commit.
2. Cycle dispos, en base :
   - planning récurrent (lun/mer 9h-12h, 4 semaines) → N créneaux créés
   - exception partielle (mer 10h-11h indispo) → **découpage** : 9h-12h devient
     9h-10h + 11h-12h
   - intervention `CONFIRMED` sur un créneau, puis réédition du planning →
     **le créneau réservé survit**. Test pivot : il valide `getConfirmedInterventionsForUser`.
3. Isolation : Senior A **non lié** au Junior B → `GET /api/users/B/availabilities`
   renvoie 403.
4. Non-régression `Intervention` : proposer + confirmer une intervention → notification
   et email partent comme avant (le flux ne doit pas avoir bougé d'un octet).

---

## Garde-fous

- Branche `feature/disponibilites-junior` créée depuis `origin/main` **avant** de coder.
- **Ne jamais modifier** `Intervention`, ses routes, ses notifications, ses emails.
  Ajout strictement additif.
- `prisma db push` **uniquement** après build vert et GO explicite d'Audrey.
- Commit local `9d4174e` non poussé sur Liannaj → à pousser quand tu veux, sans rapport.

## Décisions prises sans demander

Aucune.

## Question ouverte (non bloquante, étape 7) — TRANCHÉE le 2026-08-11

~~Le Senior doit-il pouvoir proposer une intervention **hors** des créneaux déclarés par
le Junior ? V1 : oui (affichage informatif seulement, flux inchangé).~~

**Non — blocage dur.** Décision d'Audrey. Une proposition hors créneaux est refusée en
400, et l'UI ne permet plus de saisir une date libre : le Senior clique un créneau vert
dans la grille semaine. La contrainte est donc garantie par construction côté UI, et
vérifiée côté serveur pour les trois chemins de création.

Le jeune **confirme toujours** (`PROPOSED → CONFIRMED`) : une disponibilité déclarée
n'est pas un engagement.

## Prochaine action

`npx prisma db push` pour créer la table `Availability` en base — c'est le seul
reste. Additif pur (nouvelle table + nouvel enum, aucune table existante modifiée).
Tant que ce n'est pas fait, la feature échoue au runtime.
