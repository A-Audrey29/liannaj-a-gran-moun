# FEVES — liannaj a gran moun

Application web de mise en relation entre **seniors** et **jeunes** pour des activités sociales en Guadeloupe.

> "liannaj a gran moun" signifie "lien avec les personnes âgées" en créole guadeloupéen.

---

## Prérequis

- Node.js 20+
- PostgreSQL 14+
- Un compte [Brevo](https://www.brevo.com/) pour les emails transactionnels (optionnel en dev)

---

## Installation locale en 5 étapes

```bash
# 1. Cloner le dépôt
git clone <url-du-repo>
cd feves

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env
# Éditer .env et renseigner DATABASE_URL et SESSION_SECRET au minimum

# 4. Initialiser la base de données et générer le client Prisma
npx prisma generate
npx prisma db push

# 5. (Optionnel) Peupler avec des données de test
npx tsx prisma/seed.ts

# Lancer l'application
npm run dev
```

L'application tourne sur **http://localhost:5000**

---

## Comptes de test (après seed)

| Email | Mot de passe | Rôle | Statut |
|---|---|---|---|
| admin@feves.fr | password | ADMIN | ACTIVE |
| senior@test.fr | password | SENIOR | ACTIVE |
| senior2@test.fr | password | SENIOR | ACTIVE |
| junior@test.fr | password | JUNIOR | ACTIVE |
| junior2@test.fr | password | JUNIOR | ACTIVE |
| senior.pending@test.fr | password | SENIOR | PENDING_VALIDATION |

Tous les comptes actifs sont en Guadeloupe (Les Abymes 97139 / Pointe-à-Pitre 97110).

---

## Structure du projet

```
prisma/
  schema.prisma      # Schéma de données (12 modèles)
  seed.ts            # Données de test
generated/
  prisma/            # Client Prisma auto-généré — NE PAS MODIFIER
server/
  index.ts           # Point d'entrée Express
  auth.ts            # Passport.js + sessions PostgreSQL
  routes.ts          # Toutes les routes API (~55 routes)
  storage.ts         # Interface IStorage + DatabaseStorage (CRUD)
  prisma.ts          # Singleton PrismaClient
  db.ts              # Pool PostgreSQL (pg)
  lib/               # Email, templates, SSE, push, feedback-reminder
shared/
  schema.ts          # Types TypeScript + schémas Zod (partagés front/back)
client/src/
  App.tsx            # Routeur principal (wouter)
  pages/             # Pages de l'application
  components/        # Composants réutilisables
  hooks/             # Hooks React (auth, SSE, push, toast...)
  lib/               # queryClient (TanStack Query)
uploads/             # Photos de profil uploadées (local uniquement)
docs/                # Documentation technique détaillée
```

---

## Documentation

| Fichier | Contenu |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, rôles, SSE, cycle de vie d'une relation |
| [docs/DATABASE.md](docs/DATABASE.md) | Modèles Prisma, relations, enums, commandes utiles |
| [docs/API.md](docs/API.md) | Toutes les routes API documentées |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Déploiement sur Render pas à pas |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Conventions, flux git, procédures |

---

## Variables d'environnement

Voir [.env.example](.env.example) pour la liste complète et les instructions.

---

## Technologies principales

- **Backend** : Express.js + TypeScript
- **Frontend** : React + Vite + Wouter + TanStack Query
- **ORM** : Prisma 7 (PostgreSQL)
- **Auth** : Passport.js (sessions stockées en PostgreSQL)
- **UI** : Tailwind CSS + Shadcn/UI
- **Temps réel** : SSE (Server-Sent Events)
- **Email** : Brevo API
- **Push** : Web Push API (VAPID)
