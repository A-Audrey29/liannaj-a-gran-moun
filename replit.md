# FEVES V1.3 - PWA de Mise en Relation Seniors/Jeunes

## Architecture & Stack
- **Backend**: Express.js (TypeScript)
- **Frontend**: Vite + React SPA (TypeScript) + Wouter (routing)
- **ORM**: Prisma 7 (PostgreSQL via @prisma/adapter-pg)
- **Auth**: Passport.js (LocalStrategy: email + password) + Sessions PostgreSQL (connect-pg-simple)
- **UI**: Tailwind CSS + Shadcn/UI
- **Validation**: Zod
- **Email**: Brevo API (fetch direct)
- **DB**: PostgreSQL (Replit Managed)

## Structure des Fichiers
```
prisma/
  schema.prisma          # Schéma de données V1.3 complet
  seed.ts                # Données de test (Admin, Seniors, Juniors, Relations, Interventions)
generated/
  prisma/                # Client Prisma généré (ne pas modifier)
server/
  index.ts               # Point d'entrée Express
  auth.ts                # Configuration Passport.js + sessions
  routes.ts              # Routes API (/api/auth/*, /api/validate, /api/categories, /api/notifications/*)
  storage.ts             # Interface IStorage + DatabaseStorage (Prisma)
  prisma.ts              # Instance PrismaClient singleton
  db.ts                  # Pool PostgreSQL (pg)
  lib/
    email.ts             # Fonction sendEmail (Brevo fetch direct)
    email-templates.ts   # Template HTML email de validation (branding FEVES)
  vite.ts                # Configuration Vite middleware (dev)
  static.ts              # Serving fichiers statiques (prod)
shared/
  schema.ts              # Types manuels (pas d'import Prisma côté client) + Schémas Zod de validation
client/
  src/
    App.tsx              # Routeur principal (wouter)
    index.css            # Thème rose/violet FEVES
    pages/
      login.tsx          # Page de connexion
      register.tsx       # Formulaire d'inscription complet (Senior/Junior)
      registration-pending.tsx  # Confirmation post-inscription
      validation-success.tsx    # Compte validé avec succès
      validation-error.tsx      # Token expiré/invalide + renvoi de lien
      home.tsx           # Accueil utilisateur connecté
      not-found.tsx      # Page 404
    components/
      auth-guard.tsx     # Protection des routes authentifiées
      ui/                # Composants Shadcn/UI
    hooks/
      use-auth.ts        # Hook d'authentification (useQuery /api/auth/me)
      use-mobile.tsx     # Détection mobile
      use-toast.ts       # Hook toast notifications
    lib/                 # Utilitaires (queryClient)
```

## Modèle de Données
- **User**: Admin/Senior/Junior avec statuts (PENDING_VALIDATION, ACTIVE, SUSPENDED, BANNED)
- **Category**: Catégories d'intérêts/compétences
- **UserCategory**: Table de jointure User ↔ Category
- **Relation**: Lien Senior ↔ Junior (PENDING → PENDING_FIRST_MEETING → ACTIVE → CLOSED)
- **Intervention**: Rencontres planifiées avec feedback obligatoire
- **AdminRecommendation**: Suggestions de matching Admin
- **PaymentRecord**: Historique paiements
- **Report**: Signalements
- **Notification**: Notifications in-app

## Logique Métier Clé
1. **Inscription**: User créé (PENDING_VALIDATION) → Email validation envoyé au référent → Clic lien → ACTIVE
2. **Matching**: Algorithme (même ville + intérêts communs) + boost AdminRecommendation
3. **Cadrage**: 1ère intervention créée par Admin uniquement → Relation passe ACTIVE après DONE
4. **Autonomie**: Senior propose intervention → Junior accepte/refuse
5. **Feedback Obligatoire**: DONE → COMPLETED_PENDING_FEEDBACK → les deux notent → COMPLETED
6. **Relance**: >3 jours sans feedback → email de rappel (déclenché au login)

## Comptes de Test (Seed)
- admin@feves.fr / password (ADMIN, ACTIVE)
- senior@test.fr / password (SENIOR, ACTIVE, Lyon)
- junior@test.fr / password (JUNIOR, ACTIVE, Lyon)
- junior2@test.fr / password (JUNIOR, ACTIVE, Lyon)
- senior.pending@test.fr / password (SENIOR, PENDING_VALIDATION, Marseille)

## Variables d'Environnement
- DATABASE_URL (Replit Managed)
- SESSION_SECRET (Replit Secret)
- BREVO_API_KEY (à configurer)
- BREVO_SENDER_EMAIL (à configurer, default: noreply@feves.fr)
- BREVO_SENDER_NAME (à configurer, default: FEVES)

## Sprints Prévus
1. ✅ **Sprint 1**: Fondations (Prisma, Auth, Seed, Thème, Brevo)
2. ✅ **Sprint 2**: Inscription + Validation Comptes (formulaires, token UUID 24h, emails Brevo au validateur, renvoi de lien)
3. 🔲 **Sprint 3**: Logique Backend (Matching, Relations, Interventions)
4. 🔲 **Sprint 4**: Interfaces Utilisateurs (Senior, Junior)
5. 🔲 **Sprint 5**: Dashboard Admin (Gestion, Supervision)
6. 🔲 **Sprint 6**: Notifications + Emails + PWA
