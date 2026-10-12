# Base de données — Lyannaj

## Technologie

- **PostgreSQL** (version 14+)
- **Prisma 7** comme ORM (schéma dans `prisma/schema.prisma`)
- Le client Prisma est généré dans `generated/prisma/` — ne jamais modifier ce dossier
- Les migrations versionnées vivent dans `prisma/migrations/` — **toujours committées**

---

## Règle : migrations, jamais `db push`

`prisma db push` synchronise la base sur le schéma sans laisser de trace et
**sans demander confirmation avant de supprimer une colonne**. Aucun historique,
aucun rollback possible.

Toute évolution de schéma passe donc par une migration versionnée :

```bash
# 1. Modifier prisma/schema.prisma

# 2. Écrire le SQL À LA MAIN dans prisma/migrations/<timestamp>_<nom>/migration.sql
#    (ou le générer avec `prisma migrate diff ... --script`).
#    NE PAS lancer `migrate dev` (même avec --create-only) tant que .env pointe
#    sur Neon : il applique d'abord les migrations en attente sur la vraie base
#    (voir .agents/memory/incidents.md, 2026-10-07).

# 3. Y ajouter le SQL de rollback en commentaire de fin, puis tester sur une
#    base LOCALE : `npm test` applique les migrations sur lyannaj_test
#    (`prisma migrate deploy`) et valide qu'elles reconstruisent une base complète.

# 4. Committer le dossier de migration avec le changement de schéma
```

En production, seule cette commande est utilisée — elle applique les migrations
en attente et ne fait rien d'autre :

```bash
npx prisma migrate deploy
```

### Migration réversible

Chaque migration doit porter son SQL de rollback en commentaire de fin. Pour
qu'un rollback reste possible sans perte :

- Ajouter une colonne → toujours nullable, ou avec valeur par défaut
- Renommer → ajouter la nouvelle, migrer les données, supprimer l'ancienne
  dans une migration **ultérieure** (jamais dans la même)
- Supprimer une colonne → vérifier d'abord qu'aucun code déployé ne la lit

---

## Commandes utiles

```bash
# Générer le client Prisma après modification du schéma
npx prisma generate

# Créer une migration : base LOCALE uniquement, DATABASE_URL forcée à la main.
# Jamais tant que .env pointe sur Neon (voir .agents/memory/incidents.md).
DATABASE_URL="postgresql://$USER@localhost:5432/ma_base_locale" \
  npx prisma migrate dev --name mon_changement

# Appliquer les migrations en attente (prod, CI)
npx prisma migrate deploy

# Vérifier une dérive entre le schéma et la base
npx prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource --script

# Ouvrir l'interface visuelle de la base de données
npx prisma studio

# Peupler la base avec des données de test (DEV UNIQUEMENT — vide toutes les tables)
npx tsx prisma/seed.ts
```

> **Jamais en production** : `db push`, `--force-reset`, et `prisma/seed.ts`.
> Le seed commence par vider toutes les tables. Pour créer le compte
> administrateur initial en production, utiliser `prisma/create-admin.ts`,
> qui est additif.

---

## Historique des migrations

| Migration | Contenu |
|---|---|
| `20260824000000_init` | Baseline. Schéma complet à la mise en place des migrations, **marquée comme déjà appliquée** (`migrate resolve --applied`) sur la base existante qui contenait déjà des données. Inclut la table `session` de `connect-pg-simple`. |
| `20260824000100_add_reminder_and_email_tracking` | `Intervention.reminderSentAt` (idempotence du rappel J-1), `Notification.emailSentAt` / `emailError` (traçabilité des envois Brevo). |
| `20260827000000_profile_photo_in_db` | Table `ProfilePhoto` (photos stockées en base, disque Render éphémère). |
| `20260907000000_add_credit_ledger` | Table `CreditLedger` et enum `CreditMovementType` (système de crédits prépayés pour les ateliers). Migration additive, sans impact sur les tables existantes. |
| `20261007111325_add_meeting_check_reminder` | Valeur `MEETING_CHECK` sur l'enum `NotificationType`, colonne `Intervention.meetingCheckReminderSentAt` (idempotence de la relance « la rencontre a-t-elle eu lieu ? »). Additive. Appliquée sur Neon avant d'avoir son rollback : celui-ci est dans `down.sql` (le `migration.sql` n'est plus modifiable, son empreinte est vérifiée par Prisma). Postgres ne sachant pas retirer une valeur d'enum, le rollback recrée le type. |

> **Note sur la table `session`** : elle est créée par `connect-pg-simple` et
> n'existe pas dans `schema.prisma` (aucun accès via le client Prisma). Une
> comparaison schéma ↔ base la signalera donc toujours comme « manquante » :
> c'est normal et sans conséquence. Elle est incluse dans la migration init
> pour qu'une base neuve soit complète.

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

### `CreditMovementType`
Type de mouvement dans l'historique de crédits d'un Senior.

| Valeur | Description |
|---|---|
| `PURCHASE` | Achat d'un pack de crédits, enregistré par un admin |
| `CONSUMPTION` | Décompte d'un crédit à la complétion d'une intervention facturable |
| `ADJUSTMENT` | Correction manuelle par un admin (erreur, geste commercial) |

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

### `CreditLedger`
Historique des mouvements de crédits d'un Senior (achats, consommations,
ajustements). Le solde d'un Senior est toujours dérivé de la somme des
`amount` de ses entrées, jamais stocké comme compteur séparé.

| Champ | Type | Description |
|---|---|---|
| `seniorId` | String | Senior propriétaire du solde (jamais l'aidant/référent, même si c'est lui qui paie) |
| `type` | CreditMovementType | PURCHASE / CONSUMPTION / ADJUSTMENT |
| `amount` | Int | Signé : positif pour un achat, négatif pour une consommation |
| `reason` | String | Explication lisible du mouvement |
| `triggeredById` | String? | Admin ayant déclenché le mouvement |
| `interventionId` | String? | Intervention concernée (pour une CONSUMPTION) |
| `paymentRecordId` | String? | Paiement à l'origine du mouvement (pour un PURCHASE) |

> La première rencontre d'une relation (`PENDING_FIRST_MEETING`) est gratuite
> par défaut et ne génère pas de CONSUMPTION, sauf si sa durée prévue dépasse
> 30 minutes.

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
