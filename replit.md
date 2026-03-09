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
  routes.ts              # Routes API complètes (auth, matching, relations, interventions, feedback, admin)
  storage.ts             # Interface IStorage + DatabaseStorage (CRUD complet: users, categories, relations, interventions, recommendations, notifications, matching)
  prisma.ts              # Instance PrismaClient singleton
  db.ts                  # Pool PostgreSQL (pg)
  lib/
    email.ts             # Fonction sendEmail (Brevo fetch direct)
    email-templates.ts   # Templates HTML emails (validation, relation acceptée, intervention, feedback, admin)
    feedback-reminder.ts # Relance automatique feedback > 3 jours (setInterval 6h)
  vite.ts                # Configuration Vite middleware (dev)
  static.ts              # Serving fichiers statiques (prod)
shared/
  schema.ts              # Types manuels (pas d'import Prisma côté client) + Schémas Zod de validation
client/
  src/
    App.tsx              # Routeur principal (wouter)
    index.css            # Thème rouge #dc4256 / lavande #f3eaff
    pages/
      landing.tsx        # Page d'accueil publique (non connecté)
      login.tsx          # Page de connexion
      register.tsx       # Formulaire d'inscription complet (Senior/Junior)
      registration-pending.tsx  # Confirmation post-inscription
      validation-success.tsx    # Compte validé avec succès
      validation-error.tsx      # Token expiré/invalide + renvoi de lien
      home.tsx           # Mon espace (Dashboard 4 onglets : Tableau de bord, Rencontres, Demandes, Profil)
      admin.tsx          # Dashboard Admin (8 onglets : Utilisateurs, Relations, Rencontres, Cadrage, Paiements, Notifications, Mon compte, Créer admin)
      notifications.tsx  # Page notifications complète (toutes, marquer lu, tout marquer lu)
      relation-detail.tsx # Détail relation + interventions + feedback étoiles
      not-found.tsx      # Page 404
    components/
      app-layout.tsx     # Layout partagé (header brand + footer + notifications cloche)
      auth-guard.tsx     # Protection des routes authentifiées
      star-rating.tsx    # Composant étoiles cliquables (1-5) / lecture seule
      status-badge.tsx   # Badge coloré selon statut (relation/intervention/rôle)
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
6. **Relance**: >3 jours sans feedback → email de rappel automatique (cron 6h) + in-app au login
7. **Emails transactionnels**: relation acceptée, intervention proposée/confirmée, feedback requis (Brevo, fail silencieux)

## Comptes de Test (Seed) — Tous en Guadeloupe
- admin@feves.fr / password (ADMIN, ACTIVE, Pointe-à-Pitre 97110)
- **Seniors (Les Abymes 97139)** :
  - senior@test.fr / password — Jean Dupont (ACTIVE, Jardinage)
  - senior2@test.fr / password — Madeleine Fontaine (ACTIVE, Cuisine, Lecture)
  - senior3@test.fr / password — Georges Blanc (ACTIVE, Bricolage, Jardinage, subscriptionActive)
  - senior4@test.fr / password — Simone Rousseau (ACTIVE, Informatique, Promenade)
  - senior5@test.fr / password — René Moreau (ACTIVE, Cuisine, Promenade, Jardinage)
  - senior.pending@test.fr / password — Pierre Durand (PENDING_VALIDATION, Pointe-à-Pitre 97110)
- **Juniors (Les Abymes 97139)** :
  - junior@test.fr / password — Marie Martin (ACTIVE, Jardinage, Bricolage)
  - junior2@test.fr / password — Lucas Bernard (ACTIVE, Informatique)
  - junior3@test.fr / password — Emma Lefèvre (ACTIVE, Cuisine, Jardinage)
  - junior4@test.fr / password — Théo Garcia (ACTIVE, Informatique, Bricolage)
  - junior5@test.fr / password — Léa Dubois (ACTIVE, Lecture, Promenade)
  - junior6@test.fr / password — Nathan Petit (ACTIVE, Cuisine, Promenade, Bricolage)
- **6 Catégories** : Bricolage, Jardinage, Informatique, Cuisine, Lecture, Promenade
- **5 Relations** : Senior1↔Junior1 (ACTIVE), René→Emma (PENDING), Madeleine↔Léa (PENDING_FIRST_MEETING), Georges↔Théo (ACTIVE), Simone↔Nathan (ACTIVE)
- **5 Interventions** : 1 CONFIRMED, 1 PROPOSED, 2 COMPLETED, 1 COMPLETED_PENDING_FEEDBACK
- **2 AdminRecommendations**, **1 Paiement**, **4 Notifications**

## Variables d'Environnement
- DATABASE_URL (Replit Managed)
- SESSION_SECRET (Replit Secret)
- BREVO_API_KEY (à configurer)
- BREVO_SENDER_EMAIL (à configurer, default: noreply@feves.fr)
- BREVO_SENDER_NAME (à configurer, default: FEVES)

## Routes API (Sprint 3)
- `POST /api/auth/register` — inscription (validation Zod + anti-auto-validation + anti-freemail Junior)
- `POST /api/auth/login` — connexion (retourne hasPendingFeedback)
- `POST /api/auth/logout` — déconnexion
- `GET /api/auth/me` — utilisateur courant
- `POST /api/auth/resend-validation` — renvoi lien validation
- `GET /api/validate` — validation token → ACTIVE
- `GET /api/categories` — liste catégories
- `GET /api/notifications[/count]` — notifications
- `PATCH /api/notifications/:id/read` — marquer lue
- `PATCH /api/notifications/read-all` — marquer toutes lues
- `GET /api/matching/suggestions` — suggestions matching (même ville + intérêts + boost admin)
- `GET /api/relations` — relations du user
- `GET /api/relations/:id` — détail relation + interventions
- `POST /api/relations` — créer relation (Senior only, body: { juniorId })
- `PATCH /api/relations/:id/accept` — Junior accepte → PENDING_FIRST_MEETING
- `PATCH /api/relations/:id/reject` — Junior refuse → CLOSED
- `PATCH /api/relations/:id/close` — fermer relation
- `POST /api/relations/:relationId/interventions` — créer intervention (Admin si 1ère, Senior si ACTIVE)
- `PATCH /api/interventions/:id/confirm` — Junior confirme
- `PATCH /api/interventions/:id/done` — Admin valide → COMPLETED_PENDING_FEEDBACK (+ACTIVE si 1ère)
- `PATCH /api/interventions/:id/cancel` — annuler (Senior/Admin)
- `GET /api/interventions/pending-feedback` — feedbacks en attente
- `POST /api/interventions/:id/feedback` — soumettre feedback (rating 1-5 + comment)
- `POST /api/admin/recommendations` — recommandation admin
- `DELETE /api/admin/recommendations/:id` — supprimer recommandation
- `GET /api/admin/users` — liste tous les utilisateurs (requireAdmin)
- `PATCH /api/admin/users/:id/validate` — valider un utilisateur PENDING → ACTIVE
- `PATCH /api/admin/users/:id/suspend` — suspendre un utilisateur
- `DELETE /api/admin/users/:id` — supprimer un utilisateur
- `GET /api/admin/relations` — toutes les relations
- `GET /api/admin/relations/pending-meeting` — relations en attente de 1ère rencontre
- `GET /api/admin/interventions` — toutes les interventions avec participants
- `PATCH /api/auth/me/password` — changer le mot de passe (requireAuth)
- `GET /api/admin/payments` — tous les paiements
- `POST /api/admin/payments` — enregistrer un paiement (active subscriptionActive)
- `GET /api/admin/notifications` — toutes les notifications avec user associé (requireAdmin)
- `POST /api/admin/create-admin` — créer un compte administrateur (requireAdmin)

## Règles Métier Clés
1. **Seuls les Seniors initient** les relations (Junior 403)
2. **Anti-auto-validation** : email validateur ≠ email utilisateur
3. **Anti-freemail** : validateur Junior ne peut pas être @gmail, @yahoo, etc. (prod seulement)
4. **Cadrage** : 1ère intervention créée par Admin uniquement → Relation ACTIVE après DONE
5. **Autonomie** : Senior propose interventions suivantes → Junior confirme
6. **Feedback obligatoire** : DONE → COMPLETED_PENDING_FEEDBACK → les deux notent → COMPLETED
7. **Login feedback check** : hasPendingFeedback retourné au login

## Design System
- **Nom plateforme** : "liannaj a gran moun" (font Architects Daughter, couleur #dc4256)
- **Fond** : #fbfbfb (zones contenu), #f3eaff / #e8d7fe (zones lavande)
- **Titres** : #dc4256 (rouge)
- **Cartes** : fond blanc, rounded-2xl, ombres douces
- **Boutons** : #dc4256 rouge, rounded-full
- **Badges** : #e8d7fe violet clair
- **Images assets** : seniorF, jeuneF, mainsConfiance, seniorJeuneHRire (import @assets/...)

## Sprints Prévus
1. ✅ **Sprint 1**: Fondations (Prisma, Auth, Seed, Thème, Brevo)
2. ✅ **Sprint 2**: Inscription + Validation Comptes (formulaires, token UUID, emails Brevo, renvoi de lien)
3. ✅ **Sprint 3**: Logique Backend (Matching, Relations, Interventions, Feedback, Admin Recommendations)
4. ✅ **Sprint 4**: Interfaces Utilisateurs (Landing, Dashboard 4 onglets, Détail Relation, Feedback étoiles, Notifications)
5. ✅ **Sprint 5**: Dashboard Admin (Gestion utilisateurs, Relations, Rencontres avec fiche profil, Cadrage 1ère rencontre, Paiements)
6. ✅ **Sprint 6**: Notifications enrichies + Emails transactionnels + Relance feedback auto + PWA installable
7. ✅ **Sprint 7**: Admin améliorations — Nom cliquable → modale profil partout, recherche par nom tous onglets, filtre ADMIN, référent sur card, onglet Notifications admin, fix bouton retour
