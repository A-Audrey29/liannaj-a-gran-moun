# Guide de contribution — FEVES

Bienvenue dans l'équipe. Ce guide vous explique comment travailler sur le projet sans casser ce qui existe.

---

## Conventions de code

### TypeScript
- Tout le code est en TypeScript strict
- Pas de `any` sauf si absolument nécessaire (documentez pourquoi)
- Pas d'import React explicite (`import React from 'react'`) — le transformeur JSX le gère automatiquement
- Les variables d'environnement côté frontend s'accèdent via `import.meta.env.VITE_MA_VARIABLE` (pas `process.env`)

### Nommage
- **Fichiers** : kebab-case (`messages-tab.tsx`, `use-auth.ts`)
- **Composants React** : PascalCase (`MessagesTab`)
- **Fonctions / variables** : camelCase (`getUserById`, `isLoading`)
- **Variables d'environnement** : SCREAMING_SNAKE_CASE (`SESSION_SECRET`)
- **Constantes** : SCREAMING_SNAKE_CASE

### Dans l'UI : JUNIOR → "Jeune"
Le terme `JUNIOR` est utilisé dans la base de données et le code. Dans tous les textes affichés à l'utilisateur, on affiche **"Jeune"** (jamais "Junior").

---

## Flux git recommandé

```bash
# 1. Toujours partir de main à jour
git checkout main
git pull origin main

# 2. Créer une branche descriptive
git checkout -b feat/nom-de-la-feature
# ou : fix/nom-du-bug

# 3. Développer et commiter régulièrement
git add .
git commit -m "feat: ajoute la page de profil senior"

# 4. Pousser et ouvrir une Pull Request
git push origin feat/nom-de-la-feature
```

**Format des commits :**
- `feat: description` — nouvelle fonctionnalité
- `fix: description` — correction de bug
- `refactor: description` — refactoring sans changement de comportement
- `docs: description` — documentation uniquement
- `style: description` — formatage, espacements

---

## Comment ajouter un nouveau modèle Prisma

Voici la procédure complète, de A à Z.

### Étape 1 — Modifier le schéma Prisma

Éditer `prisma/schema.prisma` et ajouter le modèle :

```prisma
model MonNouveauModele {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  contenu   String
  createdAt DateTime @default(now())

  @@index([userId])
}
```

Si le modèle est lié à `User`, ajouter la relation inverse dans le modèle `User` :
```prisma
model User {
  // ...
  monNouveauModele MonNouveauModele[]
}
```

### Étape 2 — Regénérer le client Prisma

```bash
npx prisma generate
npx prisma db push
```

### Étape 3 — Déclarer les types partagés

Dans `shared/schema.ts`, ajouter :
```typescript
export type MonNouveauModele = {
  id: string;
  userId: string;
  contenu: string;
  createdAt: Date;
};

export type InsertMonNouveauModele = Omit<MonNouveauModele, 'id' | 'createdAt'>;
```

> Les types `shared/schema.ts` sont importés côté frontend. Ne jamais importer depuis `generated/prisma` dans le frontend.

### Étape 4 — Ajouter les méthodes dans IStorage

Dans `server/storage.ts`, ajouter à l'interface `IStorage` :
```typescript
getMonNouveauModele(userId: string): Promise<MonNouveauModele[]>;
createMonNouveauModele(data: InsertMonNouveauModele): Promise<MonNouveauModele>;
deleteMonNouveauModele(id: string): Promise<void>;
```

Puis implémenter dans la classe `DatabaseStorage` :
```typescript
async getMonNouveauModele(userId: string) {
  return prisma.monNouveauModele.findMany({ where: { userId } });
}

async createMonNouveauModele(data: InsertMonNouveauModele) {
  return prisma.monNouveauModele.create({ data });
}

async deleteMonNouveauModele(id: string) {
  await prisma.monNouveauModele.delete({ where: { id } });
}
```

### Étape 5 — Ajouter les routes API

Dans `server/routes.ts`, ajouter les routes en utilisant uniquement `storage` :
```typescript
app.get("/api/mon-modele", requireAuth, async (req, res) => {
  try {
    const items = await storage.getMonNouveauModele(req.user!.id);
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: "Erreur" });
  }
});
```

### Étape 6 — Consommer depuis le frontend

Dans le composant React, utiliser TanStack Query :
```typescript
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { MonNouveauModele } from "@shared/schema";

// Lecture
const { data, isLoading } = useQuery<MonNouveauModele[]>({
  queryKey: ["/api/mon-modele"],
});

// Écriture
const mutation = useMutation({
  mutationFn: (data: InsertMonNouveauModele) =>
    apiRequest("POST", "/api/mon-modele", data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/mon-modele"] });
  },
});
```

---

## Règles UX pour le public senior

L'application est destinée à des personnes âgées, souvent peu à l'aise avec le numérique. Ces règles sont non négociables :

- **Texte grand** : minimum `text-base` (16px). Privilégier `text-lg` (18px) pour le contenu principal
- **Boutons grands** : minimum `py-3 px-6`, toujours avec un label explicite
- **Labels explicites** : les boutons doivent dire clairement ce qu'ils font ("Envoyer un message à Marie", pas juste "Envoyer")
- **Pas d'icônes seules** : toujours accompagnées d'un texte
- **Contraste élevé** : ne jamais utiliser de texte gris clair sur fond blanc
- **Feedback visuel** : toujours un état de chargement (`isLoading`) et un message de succès/erreur après une action
- **Pas d'actions destructives sans confirmation** : une modale de confirmation avant toute suppression

---

## Points d'attention critiques

### Ce qu'on ne modifie PAS
- `package.json` — pour installer un package, utiliser les outils d'installation fournis par l'environnement
- `vite.config.ts` et `server/vite.ts` — configuration Vite préconfigurée, ne pas toucher
- `generated/prisma/` — dossier auto-généré par Prisma, ne jamais modifier manuellement
- `drizzle.config.ts` — vestige de l'ancienne config, ne pas modifier

### En-têtes de sécurité Helmet — comportement dev vs prod

Trois en-têtes HTTP sont **désactivés en développement** (`NODE_ENV !== "production"`) et actifs uniquement en production (Render) :

| En-tête | Dev (Replit, VS Code, local…) | Production (Render) |
|---|---|---|
| `Content-Security-Policy` | Désactivé (Vite hot-reload incompatible) | Activé, strict |
| `Strict-Transport-Security` | Désactivé (pas de HTTPS local) | Activé |
| `X-Frame-Options` | Désactivé (les IDE affichent l'app dans un iframe) | `DENY` |

**Migration hors Replit** : aucun impact. Que vous développiez sous VS Code, WebStorm ou autre, `NODE_ENV` n'est jamais `"production"` en local — le comportement est identique à Replit.

Voir `server/index.ts:31-63` pour le code commenté.

### Photos de profil — toujours utiliser `getPhotoUrl()`
Les photos sont stockées en base avec le chemin `/uploads/xxx.jpg`, mais le dossier `uploads/` n'est **pas** exposé publiquement. Le frontend doit utiliser `getPhotoUrl()` de `client/src/lib/photo-url.ts` pour convertir ces chemins en `/api/photos/xxx.jpg` (route authentifiée).

```typescript
import { getPhotoUrl } from "@/lib/photo-url";

// Dans un composant
<img src={getPhotoUrl(user.profilePhoto)} alt="Photo de profil" />
```

### Toujours passer par IStorage
Le backend ne doit jamais appeler directement le client Prisma dans `routes.ts`. Toutes les opérations base de données passent par l'interface `IStorage` dans `server/storage.ts`. Cela permet de changer la DB sous-jacente sans toucher aux routes.

```typescript
// CORRECT
const user = await storage.getUser(id);

// INTERDIT dans routes.ts
const user = await prisma.user.findUnique({ where: { id } });
```

### Clés de cache TanStack Query
Pour les ressources avec ID variable, utiliser un tableau comme clé :
```typescript
// Correct — invalide correctement par relation
queryKey: ["/api/relations", relationId]

// Moins bien — invalide tout ou rien
queryKey: [`/api/relations/${relationId}`]
```

### Validation Zod obligatoire
Toute route qui reçoit un body doit valider avec un schéma Zod défini dans `shared/schema.ts`.

```typescript
const parsed = monSchema.safeParse(req.body);
if (!parsed.success) {
  return res.status(400).json({ message: "Données invalides", errors: parsed.error.flatten() });
}
```

---

## Structure d'une nouvelle page frontend

```typescript
// client/src/pages/ma-page.tsx
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/app-layout";
import type { MonType } from "@shared/schema";

export default function MaPage() {
  const { data, isLoading } = useQuery<MonType[]>({
    queryKey: ["/api/ma-route"],
  });

  if (isLoading) return <div>Chargement...</div>;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-red-500">Titre de la page</h1>
        {/* contenu */}
      </div>
    </AppLayout>
  );
}
```

Puis enregistrer dans `client/src/App.tsx` :
```typescript
import MaPage from "@/pages/ma-page";
// ...
<Route path="/ma-page" component={MaPage} />
```

---

## Où modifier les textes

Chaque page ou onglet correspond à une fonction précise dans un fichier. Voici la carte complète.

### Pages publiques (avant connexion)

| Ce que l'utilisateur voit | Fichier | Ligne de départ |
|---|---|---|
| Page d'accueil (hero, boutons) | `client/src/pages/landing.tsx` | `function Landing` l.9 |
| Connexion | `client/src/pages/login.tsx` | `function Login` |
| Inscription (formulaire complet) | `client/src/pages/register.tsx` | `function Register` |
| Attente de validation | `client/src/pages/registration-pending.tsx` | `function RegistrationPending` |
| Succès validation email | `client/src/pages/validation-success.tsx` | `function ValidationSuccess` |
| Erreur validation email | `client/src/pages/validation-error.tsx` | `function ValidationError` |
| Page 404 | `client/src/pages/not-found.tsx` | `function NotFound` |

### Navigation et en-tête

| Ce que l'utilisateur voit | Fichier |
|---|---|
| Nom de l'app, liens du menu, bouton déconnexion | `client/src/components/app-layout.tsx` |

### Espace utilisateur — onglets de `home.tsx`

Tout l'espace connecté (Senior/Jeune) est dans **un seul fichier** : `client/src/pages/home.tsx`.  
Chercher la fonction correspondant à l'onglet :

| Onglet affiché | Fonction dans `home.tsx` | Ligne |
|---|---|---|
| Tableau de bord | `function DashboardTab` | l.202 |
| Mes rencontres | `function RencontresTab` | l.310 |
| Messages | `client/src/components/messages-tab.tsx` | — |
| Trouver un profil | `function DemandesTab` | l.459 |
| Profil (affichage + édition) | `function ProfilTab` | l.952 |
| Aide / Signaler un problème | `function AideTab` | l.1370 |
| Noms des onglets eux-mêmes | Constante `ALL_TABS` | l.35 |

### Espace admin — onglets de `admin.tsx`

Tout le panneau admin est dans **un seul fichier** : `client/src/pages/admin.tsx`.

| Onglet affiché | Fonction dans `admin.tsx` | Ligne |
|---|---|---|
| Utilisateurs | `function UsersTab` | l.225 |
| Relations | `function RelationsTab` | l.458 |
| Cadrage (1re rencontre) | `function CadrageTab` | l.612 |
| Rencontres | `function RencontresTab` | l.838 |
| Messagerie | `client/src/components/admin-messages-tab.tsx` | — |
| Paiements | `function PaiementsTab` | l.1176 |
| Signalements | `function SignalementsTab` | l.1596 |
| Notifications | `function NotificationsAdminTab` | l.1058 |
| Mon compte | `function MonCompteTab` | l.1340 |
| Créer un admin | `function CreerAdminTab` | l.1490 |
| Noms des onglets eux-mêmes | Constante `ADMIN_TABS` | l.77 |

### Autres pages connectées

| Ce que l'utilisateur voit | Fichier |
|---|---|
| Fiche détail d'une relation | `client/src/pages/relation-detail.tsx` |
| Liste des notifications | `client/src/pages/notifications.tsx` |

### Emails transactionnels

Tous les emails envoyés par Brevo sont dans **un seul fichier** : `server/lib/email-templates.ts`.

| Email | Fonction | Ligne |
|---|---|---|
| Validation du compte (lien token) | `getValidationEmailHtml` | l.1 |
| Demande de mise en relation acceptée | `getRelationAcceptedEmailHtml` | l.116 |
| Intervention proposée | `getInterventionProposedEmailHtml` | l.141 |
| Intervention confirmée | `getInterventionConfirmedEmailHtml` | l.181 |
| Rappel de feedback | `getFeedbackReminderEmailHtml` | l.206 |
| Nouveau signalement reçu | `getNewReportEmailHtml` | l.237 |
| Nouveau compte admin créé | `getNewAdminNotificationEmailHtml` | l.282 |

> **Note** : les numéros de ligne peuvent légèrement bouger au fil des commits. Utiliser la recherche (`Ctrl+F` ou `grep`) sur le nom de la fonction si besoin.

---

## Besoin d'aide ?

- **Architecture générale** : `docs/ARCHITECTURE.md`
- **Base de données** : `docs/DATABASE.md`
- **Routes API** : `docs/API.md`
- **Déploiement** : `docs/DEPLOYMENT.md`
