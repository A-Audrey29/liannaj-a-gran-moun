# API — FEVES

Toutes les routes sont préfixées par `/api`. Le serveur tourne sur le port **5000**.

**Authentification** : basée sur les sessions (cookie `connect.sid`). Les routes marquées `Auth` exigent d'être connecté. Les routes marquées `Admin` exigent le rôle ADMIN.

**Format des réponses** : JSON. En cas d'erreur, la réponse contient un champ `message` et parfois `errors` (validation Zod).

---

## Auth & Compte

### `POST /api/auth/register`
Inscription d'un nouvel utilisateur.
- **Auth** : Non
- **Body** : `multipart/form-data` avec un champ `data` (JSON stringifié) + champ optionnel `photo` (image)
- **Champs data** : `email`, `password`, `firstName`, `lastName`, `role` (SENIOR|JUNIOR), `birthDate?`, `phone?`, `address?`, `city?`, `postalCode?`, `bio?`, `desiredActivity?`, `categoryIds?[]`, `validatorEmail`, `schoolName?` (JUNIOR), `referentTitle/FirstName/LastName/Email?` (JUNIOR), `trustedPersonName/Email?` (SENIOR)
- **Réponse 201** : `{ message: string }`
- **Notes** : Crée le compte en `PENDING_VALIDATION`. Envoie un email de validation au `validatorEmail`. L'email validateur ≠ email utilisateur (anti-auto-validation).

### `POST /api/auth/login`
Connexion.
- **Auth** : Non
- **Body** : `{ email: string, password: string }`
- **Réponse 200** : `{ user: User, hasPendingFeedback: boolean }`
- **Réponse 401** : Identifiants incorrects ou compte inactif

### `POST /api/auth/logout`
Déconnexion.
- **Auth** : Non
- **Réponse 200** : `{ message: string }`

### `GET /api/auth/me`
Récupère l'utilisateur connecté.
- **Auth** : Non (retourne 401 si non connecté)
- **Réponse 200** : `{ user: User }`

### `PATCH /api/auth/me`
Modifie le profil de l'utilisateur connecté.
- **Auth** : Oui
- **Body** : Champs du profil (partiels)
- **Réponse 200** : `{ user: User }`

### `PATCH /api/auth/me/password`
Change le mot de passe.
- **Auth** : Oui
- **Body** : `{ currentPassword: string, newPassword: string }`
- **Réponse 200** : `{ message: string }`

### `POST /api/auth/me/photo`
Upload ou remplace la photo de profil.
- **Auth** : Oui
- **Body** : `multipart/form-data` avec champ `photo` (JPG/PNG/WebP, max 5 Mo)
- **Réponse 200** : `{ user: User }`

### `DELETE /api/auth/me/photo`
Supprime la photo de profil.
- **Auth** : Oui
- **Réponse 200** : `{ user: User }`

### `GET /api/photos/:filename`
Sert une photo de profil de manière sécurisée.
- **Auth** : Oui
- **Params** : `filename` — nom du fichier sécurisé (36 caractères hexadécimaux/tirets + extension : `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.jpg|jpeg|png|webp`)
- **Réponse 200** : Image binaire avec `Content-Type` approprié
- **Réponse 400** : Nom de fichier invalide (regex anti path-traversal)
- **Réponse 404** : Photo non trouvée
- **Notes** : Le dossier `uploads/` n'est pas servi publiquement. Côté frontend, utiliser `getPhotoUrl()` de `client/src/lib/photo-url.ts` pour convertir les chemins `/uploads/xxx` en `/api/photos/xxx`.

### `POST /api/auth/resend-validation`
Renvoie l'email de validation pour un compte en attente.
- **Auth** : Non
- **Body** : `{ email: string }`
- **Réponse 200** : Message générique (toujours 200, même si compte non trouvé — sécurité)

### `GET /api/validate`
Valide un compte via le token reçu par email (redirige vers une page, pas JSON).
- **Auth** : Non
- **Params URL** : `?token=uuid`
- **Réponse** : Redirect vers `/validation-success` ou `/validation-error`

---

## Catégories

### `GET /api/categories`
Liste toutes les catégories d'activités.
- **Auth** : Non
- **Réponse 200** : `Category[]`

---

## Notifications

### `GET /api/notifications`
Liste les notifications de l'utilisateur connecté.
- **Auth** : Oui
- **Réponse 200** : `Notification[]`

### `GET /api/notifications/count`
Compteur de notifications non lues.
- **Auth** : Oui
- **Réponse 200** : `{ count: number }`

### `PATCH /api/notifications/:id/read`
Marque une notification comme lue.
- **Auth** : Oui (propriétaire uniquement)
- **Réponse 200** : `Notification`

### `PATCH /api/notifications/read-all`
Marque toutes les notifications comme lues.
- **Auth** : Oui
- **Réponse 200** : `{ message: string }`

---

## Favoris (Senior uniquement)

### `GET /api/favorites`
Liste les IDs des Jeunes mis en favori par le Senior connecté.
- **Auth** : Oui (Senior uniquement)
- **Réponse 200** : `string[]`

### `POST /api/favorites/:juniorId`
Ajoute un Jeune en favori.
- **Auth** : Oui (Senior uniquement)
- **Réponse 201** : `Favorite`

### `DELETE /api/favorites/:juniorId`
Retire un Jeune des favoris.
- **Auth** : Oui (Senior uniquement)
- **Réponse 200** : `{ message: string }`

---

## Matching

### `GET /api/matching/suggestions`
Liste les suggestions de Jeunes pour un Senior (ou l'inverse).
- **Auth** : Oui (Senior ou Junior — pas Admin)
- **Réponse 200** : `Array<{ user: User, commonCategories: string[], isRecommended: boolean, isFavorite: boolean }>`
- **Notes** : L'algorithme priorise la même ville, les catégories communes, et les recommandations admin.

---

## Relations

### `GET /api/relations`
Liste les relations de l'utilisateur connecté.
- **Auth** : Oui
- **Réponse 200** : `Relation[]` (avec `senior` et `junior` inclus, sans mot de passe)

### `GET /api/relations/:id`
Détail d'une relation avec ses interventions.
- **Auth** : Oui (participant ou Admin)
- **Réponse 200** : `Relation` (avec `senior`, `junior`, `interventions`)

### `POST /api/relations`
Envoie une demande de relation à un Jeune.
- **Auth** : Oui (Senior uniquement)
- **Body** : `{ juniorId: string }`
- **Réponse 201** : `Relation`

### `PATCH /api/relations/:id/accept`
Le Jeune accepte la demande → statut `PENDING_FIRST_MEETING`.
- **Auth** : Oui (Junior destinataire uniquement)
- **Réponse 200** : `Relation`

### `PATCH /api/relations/:id/reject`
Le Jeune refuse la demande → statut `CLOSED`.
- **Auth** : Oui (Junior destinataire uniquement)
- **Réponse 200** : `Relation`

### `PATCH /api/relations/:id/close`
Ferme la relation → statut `CLOSED`.
- **Auth** : Oui (participants ou Admin)
- **Réponse 200** : `Relation`

---

## Interventions (rencontres)

### `POST /api/relations/:relationId/interventions`
Crée une nouvelle rencontre.
- **Auth** : Oui
- **Body** : `{ scheduledDate: string (ISO), durationMinutes?: number, location?: string, tasks?: string[] }`
- **Réponse 201** : `Intervention`
- **Règles** :
  - Si relation `PENDING_FIRST_MEETING` : Admin uniquement
  - Si relation `ACTIVE` : Senior ou Admin

### `PATCH /api/interventions/:id/confirm`
Le Jeune confirme la rencontre → statut `CONFIRMED`.
- **Auth** : Oui (Junior de la relation uniquement)
- **Réponse 200** : `Intervention`

### `PATCH /api/interventions/:id/done`
L'Admin valide que la rencontre a eu lieu → statut `COMPLETED_PENDING_FEEDBACK`.
- **Auth** : Admin
- **Réponse 200** : `Intervention`
- **Notes** : Si c'était la 1ère intervention, la relation passe à `ACTIVE` et la conversation est créée automatiquement.

### `PATCH /api/interventions/:id/cancel`
Annule la rencontre → statut `CANCELLED`.
- **Auth** : Oui (Senior de la relation ou Admin)
- **Réponse 200** : `Intervention`

### `GET /api/interventions/pending-feedback`
Liste les interventions en attente du feedback de l'utilisateur connecté.
- **Auth** : Oui
- **Réponse 200** : `Intervention[]`

### `POST /api/interventions/:id/feedback`
Soumet le feedback d'une intervention (note 1-5 + commentaire optionnel).
- **Auth** : Oui (participant à la relation uniquement)
- **Body** : `{ rating: number (1-5), comment?: string }`
- **Réponse 200** : `Intervention`
- **Notes** : Quand les deux participants ont noté, l'intervention passe à `COMPLETED`.

---

## NPS (recommandation du service)

Voir `docs/decisions.md` (2026-10-08). Réservé aux rôles `SENIOR` et
`REFERENT_SENIOR`, après au moins une rencontre tenue, une réponse max. tous les
90 jours.

### `GET /api/nps/eligibility`
Dit si l'utilisateur connecté peut répondre maintenant (le client n'affiche la
carte « Donner mon avis » que si c'est `true`).
- **Auth** : Oui
- **Réponse 200** : `{ eligible: boolean }`

### `POST /api/nps`
Enregistre une réponse NPS.
- **Auth** : Oui
- **Body** : `{ score: number (entier 0-10), reason?: string | null (max 1000) }` — `0` est une note valide.
- **Réponse 201** : `{ id: string }`
- **Réponse 400** : `{ message: "Données invalides", errors: { score?: string[], reason?: string[] } }`
- **Réponse 403** : rôle non concerné, ou aucune rencontre tenue.
- **Réponse 409** : déjà répondu depuis moins de 90 jours (y compris deux envois simultanés).

### `GET /api/admin/nps`
Résultats pour l'onglet admin « Satisfaction ».
- **Auth** : Admin
- **Query** : `from`, `to` (optionnels, `YYYY-MM-DD`, jours en heure de Guadeloupe, `to` inclus, `from ≤ to`)
- **Réponse 200** : `NpsReport` (`shared/nps.ts`)
  ```json
  {
    "summary": { "total": 3, "promoters": 1, "passives": 1, "detractors": 1, "nps": 0 },
    "bySegment": { "SENIOR": { "...": "NpsSummary" }, "REFERENT_SENIOR": { "...": "NpsSummary" } },
    "responses": [{ "id": "", "createdAt": "ISO", "segment": "SENIOR", "score": 9,
                    "category": "PROMOTER", "reason": null, "firstName": "", "lastName": "" }]
  }
  ```
- **Notes** : `nps` vaut `null` s'il n'y a aucune réponse. Les noms sont destinés au suivi interne ; l'export CSV côté client ne les inclut pas.

---

## Messagerie

### `GET /api/messages/stream`
**Connexion SSE (Server-Sent Events)** pour la messagerie en temps réel.
- **Auth** : Oui
- **Réponse** : Flux d'événements SSE (connexion persistante, pas de JSON standard)
- **Événements** : `connected`, `new_message`, `message_sent`, `messages_read`, `message_deleted`
- **Notes** : Un heartbeat est envoyé toutes les 30s pour maintenir la connexion. Ne pas utiliser avec TanStack Query — géré par le hook `use-sse.ts`.

### `GET /api/messages/unread-count`
Compteur de messages non lus.
- **Auth** : Oui
- **Réponse 200** : `{ count: number }`

### `GET /api/messages/conversations`
Liste les conversations de l'utilisateur connecté.
- **Auth** : Oui
- **Réponse 200** : `Conversation[]` (avec dernier message et participants)

### `GET /api/messages/conversations/:id`
Messages d'une conversation (paginés, `:id` = `relationId`).
- **Auth** : Oui (participant uniquement)
- **Params URL** : `?limit=50&cursor=messageId`
- **Réponse 200** : `{ messages: Message[], conversationId: string }`
- **Notes** : La messagerie n'est disponible que pour les relations `ACTIVE`.

### `POST /api/messages/conversations/:id`
Envoie un message dans une conversation (`:id` = `relationId`).
- **Auth** : Oui (participant uniquement)
- **Body** : `{ content: string }` (max 2000 caractères)
- **Réponse 201** : `Message`

### `PATCH /api/messages/conversations/:id/read`
Marque les messages d'une conversation comme lus (`:id` = `relationId`).
- **Auth** : Oui (participant uniquement)
- **Réponse 200** : `{ message: string }`

---

## Notifications push (PWA)

### `GET /api/push/vapid-key`
Retourne la clé publique VAPID pour l'abonnement push côté client.
- **Auth** : Non
- **Réponse 200** : `{ publicKey: string | null }`

### `POST /api/push/subscribe`
Enregistre une souscription Web Push.
- **Auth** : Oui
- **Body** : Objet `PushSubscription` du navigateur (`endpoint`, `keys.p256dh`, `keys.auth`)
- **Réponse 201** : `{ message: string }`

---

## Admin — Utilisateurs

### `GET /api/admin/users`
Liste tous les utilisateurs.
- **Auth** : Admin
- **Réponse 200** : `User[]` (sans mot de passe)

### `PATCH /api/admin/users/:id/validate`
Valide manuellement un compte `PENDING_VALIDATION` → `ACTIVE`.
- **Auth** : Admin
- **Réponse 200** : `User`

### `PATCH /api/admin/users/:id/suspend`
Suspend un compte → `SUSPENDED`.
- **Auth** : Admin (impossible sur un Admin)
- **Réponse 200** : `User`

### `DELETE /api/admin/users/:id`
Supprime définitivement un compte.
- **Auth** : Admin (impossible sur un Admin)
- **Réponse 200** : `{ message: string }`

### `POST /api/admin/create-admin`
Crée un nouveau compte administrateur.
- **Auth** : Admin
- **Body** : `{ email, password, firstName, lastName }`
- **Réponse 201** : `User`

---

## Admin — Relations & Interventions

### `GET /api/admin/relations`
Liste toutes les relations.
- **Auth** : Admin
- **Réponse 200** : `Relation[]` (avec `senior` et `junior`)

### `GET /api/admin/relations/pending-meeting`
Liste les relations en statut `PENDING_FIRST_MEETING`.
- **Auth** : Admin
- **Réponse 200** : `Relation[]`

### `GET /api/admin/interventions`
Liste toutes les interventions avec participants.
- **Auth** : Admin
- **Réponse 200** : `Intervention[]` (avec `relation.senior` et `relation.junior`)

---

## Admin — Matching & Recommandations

### `POST /api/admin/recommendations`
Crée une recommandation de matching admin.
- **Auth** : Admin
- **Body** : `{ seniorId: string, juniorId: string, note?: string }`
- **Réponse 201** : `AdminRecommendation`

### `DELETE /api/admin/recommendations/:id`
Supprime une recommandation.
- **Auth** : Admin
- **Réponse 200** : `{ message: string }`

---

## Admin — Paiements

### `GET /api/admin/payments`
Liste tous les paiements.
- **Auth** : Admin
- **Réponse 200** : `PaymentRecord[]` (avec `user`)

### `POST /api/admin/payments`
Enregistre un paiement et active `subscriptionActive` de l'utilisateur.
- **Auth** : Admin
- **Body** : `{ userId: string, amount: number, label: string, date?: string }`
- **Réponse 201** : `PaymentRecord`

---

## Admin — Notifications

### `GET /api/admin/notifications`
Liste toutes les notifications de tous les utilisateurs.
- **Auth** : Admin
- **Réponse 200** : `Notification[]` (avec `user`)

---

## Admin — Messagerie (modération)

### `GET /api/admin/messages/conversations`
Liste toutes les conversations.
- **Auth** : Admin
- **Réponse 200** : `Conversation[]`

### `GET /api/admin/messages/conversations/:id`
Messages d'une conversation (inclut les messages supprimés).
- **Auth** : Admin
- **Réponse 200** : `{ messages: Message[], conversationId: string }`

### `DELETE /api/admin/messages/:messageId`
Supprime un message (soft delete — le message reste en base avec `isDeleted: true`).
- **Auth** : Admin
- **Réponse 200** : `{ message: string }`

---

## Signalements

### `POST /api/reports`
Crée un signalement depuis l'onglet "Aide" (Senior ou Junior).
- **Auth** : Oui
- **Body** :
  ```json
  {
    "reason": "PERSON" | "QUESTION" | "OTHER",
    "relationId": "string (optionnel, si reason=PERSON)",
    "message": "string (optionnel, max 2000 chars)"
  }
  ```
- **Logique** : Si `reason=PERSON` et `relationId` fourni, le `targetId` est déduit automatiquement (l'autre participant de la relation).
- **Réponse 201** : `Report`

### `GET /api/admin/reports`
Liste tous les signalements avec le reporter et la personne signalée.
- **Auth** : Admin
- **Réponse 200** : `(Report & { reporter: User; target: User | null })[]` — ordonnés du plus récent au plus ancien, OPEN en premier.

### `GET /api/admin/reports/count`
Nombre de signalements ouverts (pour le badge dans l'onglet admin).
- **Auth** : Admin
- **Réponse 200** : `{ count: number }`

### `PATCH /api/admin/reports/:id/handle`
Marque un signalement comme traité (`status: "HANDLED"`). Enregistre le commentaire de l'admin et la date de traitement.
- **Auth** : Admin
- **Body** : `{ "handledNote": "string (obligatoire, min 5 chars)" }`
- **Réponse 200** : `Report` (avec `handledNote`, `handledAt`, `status: "HANDLED"`)
- **Réponse 400** : si `handledNote` absent ou vide

**Statuts Report** : `OPEN` (défaut) | `HANDLED`  
**Raisons** : `PERSON` (problème avec une personne) | `QUESTION` (question sur l'app) | `OTHER` (autre)

> **Email automatique** : dès qu'un signalement est soumis, un email est envoyé à **tous les admins actifs** (template `getNewReportEmailHtml` dans `server/lib/email-templates.ts`). L'email contient le nom du déclarant, le type de problème, le message libre, et un lien direct vers le panneau admin.
