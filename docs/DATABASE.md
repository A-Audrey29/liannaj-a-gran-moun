# Base de données — FEVES

## Technologie

- **PostgreSQL** (version 14+)
- **Prisma 7** comme ORM (schéma dans `prisma/schema.prisma`)
- Le client Prisma est généré dans `generated/prisma/` — ne jamais modifier ce dossier

---

## Commandes utiles

```bash
# Générer le client Prisma après modification du schéma
npx prisma generate

# Appliquer le schéma à la base de données (dev)
npx prisma db push

# Ouvrir l'interface visuelle de la base de données
npx prisma studio

# Peupler la base avec les données de test
npx tsx prisma/seed.ts

# Réinitialiser la base et re-seeder (attention : supprime toutes les données)
npx prisma db push --force-reset && npx tsx prisma/seed.ts
```

> En production sur Render, la commande de build inclut `prisma generate && prisma db push` pour appliquer les migrations automatiquement.

---

## Énumérations

### `Role`
Rôle d'un utilisateur dans la plateforme.

| Valeur | Description |
|---|---|
| `ADMIN` | Administrateur — accès complet |
| `SENIOR` | Personne âgée — utilisateur principal |
| `JUNIOR` | Jeune — affiché "Jeune" dans l'UI |

### `UserStatus`
Statut d'un compte utilisateur.

| Valeur | Description |
|---|---|
| `PENDING_VALIDATION` | Compte créé, en attente de validation par le référent |
| `ACTIVE` | Compte validé et actif |
| `SUSPENDED` | Compte suspendu par un admin (peut être réactivé) |
| `BANNED` | Compte banni |

### `RelationStatus`
Statut d'une relation entre un Senior et un Jeune.

| Valeur | Description |
|---|---|
| `PENDING` | Demande envoyée par le Senior, en attente de réponse du Jeune |
| `PENDING_FIRST_MEETING` | Acceptée, en attente de la 1ère rencontre organisée par l'admin |
| `ACTIVE` | Relation active — messagerie disponible |
| `PAUSED` | Relation en pause |
| `CLOSED` | Relation terminée |

### `InterventionStatus`
Statut d'une rencontre (intervention).

| Valeur | Description |
|---|---|
| `PROPOSED` | Rencontre proposée, en attente de confirmation |
| `CONFIRMED` | Confirmée par le Jeune |
| `CANCELLED` | Annulée |
| `DONE` | Validée par l'admin comme ayant eu lieu |
| `COMPLETED_PENDING_FEEDBACK` | Terminée, feedback des deux participants attendu |
| `COMPLETED` | Terminée avec feedback des deux parties |

### `NotificationType`
Types de notifications in-app.

| Valeur | Description |
|---|---|
| `RELATION_REQUEST` | Demande de relation ou réponse à une demande |
| `INTERVENTION_PROPOSED` | Nouvelle rencontre proposée |
| `INTERVENTION_CONFIRMED` | Rencontre confirmée |
| `FEEDBACK_REMINDER` | Rappel de feedback en attente |
| `NEW_MESSAGE` | Nouveau message reçu (présent dans le schéma, non utilisé activement) |
| `SYSTEM` | Message système générique |

---

## Modèles

### `User`
Utilisateur de la plateforme (Admin, Senior, ou Junior).

| Champ | Type | Description |
|---|---|---|
| `id` | String (cuid) | Identifiant unique |
| `email` | String (unique) | Email de connexion |
| `password` | String | Mot de passe hashé (bcrypt) |
| `firstName` | String | Prénom |
| `lastName` | String | Nom de famille |
| `role` | Role | ADMIN / SENIOR / JUNIOR |
| `status` | UserStatus | Statut du compte |
| `birthDate` | DateTime? | Date de naissance (optionnel) |
| `phone` | String? | Téléphone |
| `address`, `city`, `postalCode` | String? | Adresse (utilisée pour le matching par ville) |
| `bio` | String? | Description personnelle |
| `desiredActivity` | String? | Activités souhaitées |
| `profilePhoto` | String? | Chemin vers la photo (`/uploads/uuid.jpg`) |
| `schoolName` | String? | École du Jeune (Junior uniquement) |
| `referentTitle/FirstName/LastName/Email` | String? | Référent du Jeune (Junior uniquement) |
| `trustedPersonName/Email` | String? | Personne de confiance du Senior |
| `validatorEmail` | String? | Email du validateur (reçoit le lien de validation) |
| `validationToken` | String? | Token UUID pour validation du compte |
| `subscriptionActive` | Boolean | Abonnement actif (géré par l'admin) |

### `Category`
Catégorie d'intérêt ou de compétence (ex: Jardinage, Informatique).

| Champ | Type | Description |
|---|---|---|
| `id` | String | Identifiant unique |
| `name` | String (unique) | Nom de la catégorie |

### `UserCategory`
Table de jointure entre `User` et `Category` (relation many-to-many).

| Champ | Type | Description |
|---|---|---|
| `userId` | String | Référence User |
| `categoryId` | String | Référence Category |

### `Relation`
Lien entre un Senior et un Jeune. C'est l'entité centrale de l'application.

| Champ | Type | Description |
|---|---|---|
| `id` | String | Identifiant unique |
| `seniorId` | String | Référence User (Senior) |
| `juniorId` | String | Référence User (Junior) |
| `status` | RelationStatus | Statut de la relation |
| `createdAt` | DateTime | Date de création |

> Contrainte : un seul couple `(seniorId, juniorId)` possible — `@@unique([seniorId, juniorId])`.

### `Intervention`
Rencontre planifiée dans le cadre d'une Relation.

| Champ | Type | Description |
|---|---|---|
| `id` | String | Identifiant unique |
| `relationId` | String | Relation concernée |
| `scheduledDate` | DateTime | Date et heure prévue |
| `durationMinutes` | Int | Durée en minutes (défaut : 120) |
| `location` | String? | Lieu de la rencontre |
| `status` | InterventionStatus | Statut de la rencontre |
| `tasks` | String[] | Liste des activités prévues |
| `seniorRating` | Int? (1-5) | Note du Senior |
| `seniorComment` | String? | Commentaire du Senior |
| `juniorRating` | Int? (1-5) | Note du Jeune |
| `juniorComment` | String? | Commentaire du Jeune |
| `feedbackReminderSentAt` | DateTime? | Date du dernier rappel feedback |

### `AdminRecommendation`
Suggestion de matching créée manuellement par un admin.

| Champ | Type | Description |
|---|---|---|
| `seniorId` | String | Senior recommandé |
| `juniorId` | String | Jeune recommandé pour ce Senior |
| `note` | String? | Note interne de l'admin |

> Ces recommandations boostent les suggestions dans l'algorithme de matching.

### `Favorite`
Favori Senior → Junior (le Senior met un Jeune en favori).

| Champ | Type | Description |
|---|---|---|
| `seniorId` | String | Senior |
| `juniorId` | String | Jeune mis en favori |

### `PaymentRecord`
Historique des paiements enregistrés par l'admin.

| Champ | Type | Description |
|---|---|---|
| `userId` | String | Utilisateur concerné |
| `amount` | Float | Montant |
| `label` | String | Libellé du paiement |
| `date` | DateTime | Date du paiement |

### `Report`
Signalement d'un utilisateur par un autre.

| Champ | Type | Description |
|---|---|---|
| `reporterId` | String | Auteur du signalement |
| `targetId` | String | Utilisateur signalé |
| `relationId` | String? | Relation concernée (optionnel) |
| `message` | String | Motif du signalement |
| `status` | String | Statut du signalement (défaut : "OPEN") |

### `Notification`
Notification in-app pour un utilisateur.

| Champ | Type | Description |
|---|---|---|
| `userId` | String | Destinataire |
| `type` | NotificationType | Type de notification |
| `title` | String | Titre affiché |
| `message` | String | Corps de la notification |
| `link` | String? | Lien de redirection |
| `isRead` | Boolean | Lu ou non |

### `Conversation`
Messagerie associée à une Relation ACTIVE. Une conversation par relation (`1:1`).

| Champ | Type | Description |
|---|---|---|
| `id` | String | Identifiant unique |
| `relationId` | String (unique) | Relation associée |

### `Message`
Message texte dans une Conversation.

| Champ | Type | Description |
|---|---|---|
| `conversationId` | String | Conversation parente |
| `senderId` | String | Auteur du message |
| `content` | String | Contenu du message |
| `isRead` | Boolean | Lu par le destinataire |
| `isDeleted` | Boolean | Supprimé (soft delete) |
| `deletedByAdmin` | Boolean | Supprimé par un admin |

### `PushSubscription`
Souscription Web Push d'un utilisateur (pour notifications push PWA).

| Champ | Type | Description |
|---|---|---|
| `userId` | String | Utilisateur abonné |
| `endpoint` | String (unique) | URL endpoint du navigateur |
| `p256dh` | String | Clé publique du client |
| `auth` | String | Secret d'authentification |

---

## Diagramme des relations

```
User ──────────────────────────────────────────────────────────────────┐
 │                                                                      │
 ├──< UserCategory >──── Category                                       │
 │                                                                      │
 ├──< Relation (senior) >──────────────────────────────────────────────┤
 │      │                                                     (junior)  │
 │      ├──< Intervention                                               │
 │      ├──< Report                                                     │
 │      └──  Conversation ──< Message (sender) ────────────────────────┘
 │
 ├──< AdminRecommendation (senior) / (junior)
 ├──< PaymentRecord
 ├──< Report (reporter) / (target)
 ├──< Notification
 ├──< PushSubscription
 └──< Favorite (senior) / (junior)
```
