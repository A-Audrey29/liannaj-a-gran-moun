# CLAUDE.md — Lyannaj (FEVES)

PWA de mise en relation seniors/jeunes en Guadeloupe (association FEVES). Voir
[global CLAUDE.md](~/.claude/CLAUDE.md) pour les règles générales (branches,
non-négociables, garde-fous). Ce fichier ne répète que ce qui est spécifique
à ce projet.

## Stack (vérifiée dans package.json)

- **Frontend**: React 18 + TypeScript, Vite 7, Tailwind CSS 3, Radix UI
  (shadcn), TanStack Query, react-hook-form + Zod, Wouter (routing),
  Framer Motion
- **Backend**: Node.js + Express 5 + TypeScript, exécuté via `tsx`, ESM natif
  (`"type": "module"`)
- **DB**: PostgreSQL sur Neon
- **ORM**: Prisma 7 (`@prisma/adapter-pg`) — pas Drizzle sur ce projet
- **Auth**: Passport.js (LocalStrategy) + bcryptjs + express-session
  (`connect-pg-simple`, sessions en base)
- **Paiement**: Stripe (Checkout) — crédits prépayés pour les ateliers
- **Email**: Brevo (API HTTP directe, pas de SDK)
- **Notifications**: web-push (VAPID) + SSE (`server/lib/sse.ts`) pour la
  messagerie temps réel
- **Fichiers**: multer (upload) + sharp (resize WebP) — photos stockées en
  base (`ProfilePhoto`), pas sur le filesystem Render (éphémère)
- **Tests**: Vitest + Supertest, base Postgres locale dédiée
- **Build**: esbuild (bundle serveur) + Vite (client) — script custom
  `script/build.ts`
- **Déploiement**: Render (`build`/`start` dans package.json). Origine
  Replit encore visible (`.replit`, `replit.md`) mais plus la cible actuelle.

## Structure

```
client/src/        # SPA React (pages, components, hooks, lib)
server/            # Express: routes.ts (API), auth.ts, storage.ts (accès DB),
                    # lib/ (email, push, sse, stripe-provider, availability)
shared/            # Code partagé client/serveur: schema.ts (Zod), ateliers.ts,
                    # branding.ts, dates.ts, credit-offers.ts, availability.ts
prisma/            # schema.prisma + migrations/ (versionnées, pas de db push)
generated/prisma/  # Client Prisma généré — ne jamais modifier à la main
tests/             # Vitest + Supertest, un fichier par domaine
docs/              # ARCHITECTURE, API, DATABASE, DEPLOYMENT, SECURITY, decisions.md
.agents/memory/    # Mémoire projet (MEMORY.md + fichiers par sujet)
```

Alias TS : `@/*` → `client/src/*`, `@shared/*` → `shared/*`.

## Modèle de données (Prisma — 19 modèles)

User, ProfilePhoto, Category, UserCategory, Relation, Intervention,
Availability, AdminRecommendation, PaymentRecord, CreditLedger, Report,
Notification, NpsResponse, Favorite, Conversation, Message, PushSubscription,
TeacherStudent, TeacherComment.

Le fichier `replit.md` à la racine décrit une version antérieure (Sprint 9,
avant Stripe/crédits) — ne pas s'y fier pour l'état actuel, il documente
l'historique. Source de vérité : `prisma/schema.prisma` et `docs/decisions.md`.

## Commandes

```bash
npm run dev        # serveur dev (tsx, NODE_ENV=development)
npm run build      # build prod (script/build.ts)
npm start          # lance dist/index.js (prod)
npm run check      # tsc --noEmit — doit rester à 0 erreur
npm test           # vitest run
npm run test:watch
npm run db:push    # prisma db push — NE PAS utiliser sur la base Neon avec données
```

## Règles spécifiques à ce projet

- **Migrations**: toujours via `prisma migrate` (diff + resolve baseline
  posée sur Neon), jamais `db push` ni `migrate dev` directement sur la base
  de données avec des données réelles. Toute migration doit être réversible
  (règle globale) — voir `prisma/migrations/`.
- **Dates métier**: `scheduledDate`, `startAt`, `endAt` passent uniquement par
  `shared/dates.ts` (`fmtTime`, `fmtDayLongMonth`, etc.). Jamais
  `toLocaleDateString`/`toLocaleTimeString` sur ces champs — le serveur est en
  UTC, les utilisateurs en Guadeloupe (UTC-4 fixe), le dev à Paris (DST). Les
  dates purement administratives (`createdAt`, `birthDate`) restent en
  `toLocale*`.
- **Feedback**: le masquage de visibilité (jeune/sénior ne voient que leur
  propre feedback, le référent voit celui du sénior seulement) se fait côté
  serveur avant sérialisation (`scopeFeedback` / `scopeInterventionFeedback`)
  — jamais par affichage conditionnel côté client. **Toute route qui renvoie
  une intervention doit passer par ce filtre** : aujourd'hui
  `/api/meetings/history`, `/api/relations`, `/api/relations/:id`,
  `/api/referent/relations`, `/api/interventions/pending-feedback` et la
  réponse de `POST /api/interventions/:id/feedback` (les 3 dernières
  fuyaient, corrigé le 2026-10-12, tests dans `feedback-visibility.test.ts`).
- **Crédits**: 1 crédit = 1 atelier, décompté à la complétion
  (`CONFIRMED` → `COMPLETED_PENDING_FEEDBACK`), pas à la création. Solde
  dérivé de `CreditLedger` (historique), jamais d'un compteur brut. Détail
  complet dans `docs/decisions.md`.
- **Photos**: stockées en base (table `ProfilePhoto`), converties en WebP
  800px, EXIF supprimé — jamais sur le filesystem (Render est éphémère).
- **Seed** (`prisma/seed.ts`): wipe destructif de la base. Toujours confirmer
  avant exécution, jamais sur une base contenant des données réelles.
- **Branding**: nom produit = "Lyannaj" (pas "liannaj"), centralisé dans
  `shared/branding.ts`. FEVES = l'association porteuse, Lyannaj = la
  plateforme ; e-mails signés Lyannaj, FEVES créditée en pied de page.
- **Ateliers**: catégories d'intérêt = "ateliers", source unique
  `shared/ateliers.ts`.
- **Paiement**: jamais d'import direct du SDK Stripe dans routes/webhook —
  passer par le contrat `server/lib/payment-provider.ts`
  (impl : `stripe-provider.ts`). Webhook (`/api/webhooks/payment`) vérifie la
  signature sur `req.rawBody` (capturé dans `server/app.ts`), jamais le body
  JSON déjà parsé. Détail complet dans `docs/decisions.md`.
- **NPS** (exigence du financeur): réponses dans `NpsResponse`, **jamais** en
  colonne d'`Intervention` (les routes à masquage de feedback la
  sérialiseraient). Éligibilité décidée côté serveur seulement (rôle senior /
  référent, rencontre tenue, 90 jours). Note 0 valide : ne jamais tester
  `score === 0` / `!score`. L'export CSV pour le financeur ne contient aucun
  nom ni e-mail. Détail dans `docs/decisions.md`.

## Skills — maintenir CLAUDE.md et la mémoire projet à jour

Ce fichier et `.agents/memory/` ne doivent pas dériver du code réel. Règles
de maintenance :

1. **Quand mettre à jour CLAUDE.md** (ce fichier) :
   - Changement de stack (nouvelle dépendance structurante, migration
     d'ORM/DB/déploiement) → mettre à jour la section Stack.
   - Nouveau modèle Prisma structurant, ou renommage de modèle → mettre à
     jour la section Modèle de données.
   - Nouvelle règle métier non-évidente qui a coûté un bug ou un
     aller-retour avec l'utilisateur → l'ajouter à "Règles spécifiques".
   - Ne jamais copier ici du contenu déjà exhaustif ailleurs (docs/API.md,
     docs/DATABASE.md) — renvoyer vers le fichier source, pas dupliquer.

2. **Quand écrire dans `.agents/memory/`** (mémoire projet, distincte de la
   mémoire globale `~/.claude/projects/.../memory/`) :
   - `docs/decisions.md` : une entrée par décision d'architecture, avec le
     **pourquoi** (contexte, alternatives écartées) — pas juste le quoi.
   - `.agents/memory/MEMORY.md` : index one-liner par fichier de mémoire
     projet, format `- [Titre](fichier.md) — résumé`.
   - Ne pas dupliquer ce qui est déjà dans git log/blame ou dans le code.

3. **Avant d'affirmer un fait sur ce projet** : vérifier dans le code
   (`package.json`, `prisma/schema.prisma`, fichier concerné), ne jamais
   se fier à `replit.md` (obsolète) ni à une mémoire ancienne sans la
   recouper avec l'état actuel du repo.

4. **Cadence** : à la fin d'une tâche qui change la stack, le schéma, ou
   une règle métier non-évidente, proposer spontanément la mise à jour de
   CLAUDE.md et/ou `docs/decisions.md` — ne pas attendre que l'utilisateur
   le demande.
