# Déploiement — FEVES sur Render

Ce guide explique comment déployer FEVES sur [Render](https://render.com/).

---

## Prérequis

- Un compte Render (https://render.com/)
- Le code source sur GitHub (dépôt connecté à Render)
- Une base de données PostgreSQL accessible depuis Render

---

## 1. Base de données PostgreSQL

### Option A — Render Postgres (recommandé)
1. Dans le dashboard Render, cliquez **New → PostgreSQL**
2. Choisissez un nom (ex: `feves-db`), une région (ex: `Frankfurt EU Central`)
3. Sélectionnez le plan **Free** pour démarrer
4. Copiez la **Internal Database URL** (utilisez l'URL interne si le service web est aussi sur Render)

### Option B — PostgreSQL externe
Toute base PostgreSQL accessible publiquement fonctionne (Supabase, Neon, Railway, etc.).

---

## 2. Créer le service Web

1. Dans Render, cliquez **New → Web Service**
2. Connectez votre dépôt GitHub
3. Configurez :

| Paramètre | Valeur |
|---|---|
| **Name** | `lyannaj` (ou le nom de votre choix) |
| **Region** | Frankfurt EU Central (pour la Guadeloupe, EU est recommandé) |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install && npx prisma generate && npx prisma migrate deploy && npm run build` |
| **Start Command** | `npm start` |
| **Plan** | Free ou Starter |

> **Start Command** : utiliser `npm start`, qui pointe sur le fichier réellement
> produit par le build (`dist/index.cjs`) avec `NODE_ENV=production`. Écrire
> `node dist/index.js` fait échouer le démarrage — ce fichier n'existe pas.

> **Note sur `prisma migrate deploy`** : cette commande applique les migrations
> versionnées de `prisma/migrations/` qui ne sont pas encore passées sur la base.
> Elle est idempotente (sans danger à relancer) et ne fait rien d'autre.
>
> **Ne jamais utiliser `prisma db push` en production** : cette commande aligne
> la base sur le schéma sans historique et peut supprimer une colonne — donc des
> données — sans confirmation ni rollback possible. Voir `docs/DATABASE.md`.

---

## 3. Variables d'environnement

Dans **Environment → Environment Variables** du service Render, ajouter :

| Variable | Valeur | Obligatoire |
|---|---|---|
| `DATABASE_URL` | URL PostgreSQL (interne ou externe) | Oui |
| `SESSION_SECRET` | Chaîne aléatoire de 32+ caractères | Oui |
| `BASE_URL` | `https://votre-service.onrender.com` | Oui |
| `NODE_ENV` | `production` | Oui |
| `BREVO_API_KEY` | Clé API Brevo | Pour les emails |
| `BREVO_SENDER_EMAIL` | Adresse email vérifiée dans Brevo | Pour les emails |
| `BREVO_SENDER_NAME` | `FEVES` (ou autre nom) | Pour les emails |
| `VAPID_PUBLIC_KEY` | Clé publique VAPID | Pour les notifications push |
| `VAPID_PRIVATE_KEY` | Clé privée VAPID | Pour les notifications push |
| `VAPID_SUBJECT` | `mailto:contact@feves.fr` | Pour les notifications push |

> **Comment générer `SESSION_SECRET`** :
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

> **Comment générer les clés VAPID** :
> ```bash
> npx web-push generate-vapid-keys
> ```

---

## 4. Health Check

Render vérifie que le service est démarré via une URL de santé. Configurez :

| Paramètre | Valeur |
|---|---|
| **Health Check Path** | `/api/health` |

Cette route est publique et vérifie aussi la connexion à la base : elle répond
`200 {"status":"ok"}` si tout va bien, `503` si la base est injoignable. Render
retire alors l'instance du trafic.

> Ne pas utiliser `/api/auth/me` : cette route répond `401` quand personne n'est
> connecté, ce que Render interprète comme un échec du service.

---

## 5. Premier déploiement

1. Cliquez **Deploy** dans Render
2. Suivez les logs de déploiement — les étapes importantes sont :
   - `npm install` — installation des dépendances
   - `npx prisma generate` — génération du client Prisma
   - `npx prisma migrate deploy` — application des migrations en attente
   - `npm run build` — compilation TypeScript + Vite
3. Une fois déployé, allez sur l'URL du service
4. Créer le compte administrateur initial. Dans le shell Render (onglet
   **Shell** du service) :
   ```bash
   ADMIN_EMAIL=votre@email.fr \
   ADMIN_PASSWORD='<mot de passe long et unique>' \
   ADMIN_FIRST_NAME=Prenom \
   ADMIN_LAST_NAME=Nom \
     npx tsx prisma/create-admin.ts
   ```
   Ce script est **additif** : il ne supprime rien et peut être relancé sans
   risque (il réinitialise alors le mot de passe du compte).

> **Ne jamais exécuter `npx tsx prisma/seed.ts` en production.** Ce script vide
> toutes les tables — utilisateurs, rencontres, messages — avant de recréer des
> données de démonstration. Il refuse désormais de tourner sur une base distante,
> mais la garde ne remplace pas la vigilance.

---

## 6. Persistance des photos de profil

Le système de fichiers de Render est **éphémère** : tout ce qui est écrit dans
`uploads/` disparaît à chaque déploiement.

Les photos sont donc **stockées en base de données** (table `ProfilePhoto`).
Aucun disque à monter, aucun service externe à configurer, et les photos
entrent dans les sauvegardes PostgreSQL — ce qu'un disque monté ne permet pas.

Chaque photo est redimensionnée (800 px max) et convertie en WebP à l'upload :
environ 150 Ko par photo, soit ~75 Mo pour 500 utilisateurs.

### Migration des photos existantes

Si une base contient déjà des photos référencées sur le disque, les importer
une fois, via le shell Render :

```bash
npx tsx prisma/migrate-photos-to-db.ts            # simulation
npx tsx prisma/migrate-photos-to-db.ts --apply    # import réel
```

Le script est additif et rejouable : il ne supprime aucun fichier et ignore
les photos déjà en base. Les URL externes (avatars de démonstration) sont
laissées telles quelles.

> Tant que la migration n'a pas tourné, la route `/api/photos/:filename` sert
> encore les photos depuis le disque en dernier recours. Cette compatibilité
> pourra être retirée une fois tous les environnements migrés.

---

## 7. Mises à jour

Chaque push sur la branche `main` déclenche un déploiement automatique sur Render (si **Auto-Deploy** est activé). Le processus est :

```
Push git → Render détecte → Build → prisma migrate deploy → Démarrage
```

Aucune action manuelle n'est nécessaire pour les mises à jour normales.

---

## 8. Surveillance et logs

- **Logs** : onglet **Logs** dans le dashboard Render
- **Métriques** : onglet **Metrics** (CPU, mémoire)
- **Alertes** : configurer dans **Notifications** (email si le service tombe)

---

## Récapitulatif des commandes clés

```bash
# Build Command (Render)
npm install && npx prisma generate && npx prisma migrate deploy && npm run build

# Start Command (Render)
npm start

# Compte administrateur initial (via Shell Render) — additif, rejouable
ADMIN_EMAIL=votre@email.fr ADMIN_PASSWORD='<long>' \
ADMIN_FIRST_NAME=Prenom ADMIN_LAST_NAME=Nom \
  npx tsx prisma/create-admin.ts

# Générer SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Générer clés VAPID
npx web-push generate-vapid-keys
```

> **Jamais en production** : `prisma db push`, `prisma migrate reset`,
> `npx tsx prisma/seed.ts`.
