# Décisions techniques

Journal des choix d'architecture et de leurs raisons. Une entrée par décision,
la plus récente en haut.

## 2026-10-13 — Forfaits nommés et page de vente `/forfaits`

**Décision.** `CreditOffer` gagne un champ `name` (Découverte, Essentiel,
Sérénité — provisoires). Trois offres : `pack-1` 18 €, `pack-5` 85 €,
`pack-10` 160 €. `shared/credit-offers.ts` reste la seule source : carte
d'achat, admin et page publique `/forfaits` lisent `CREDIT_OFFERS`.

**Raison.** Les id `pack-1` et `pack-5` sont conservés : le webhook relit
`metadata.offerId`, un id renommé ferait perdre les crédits d'un paiement en
cours. La page de vente ne décrit que des règles présentes dans le code
(`server/storage.ts`, `shared/credits.ts`) ; une règle ajoutée ou modifiée
côté serveur impose de relire `client/src/pages/forfaits.tsx`.

**Alternative écartée.** Prix et textes en base avec écran d'admin : inutile
tant que les prix changent rarement (un redéploiement suffit).

## 2026-10-12 — Relance des rencontres non clôturées : aux admins, une seule fois

**Contexte.** Les rencontres `PROPOSED`/`CONFIRMED` dont la date est passée
restaient bloquées (blocker #4). La première version de la relance écrivait
au sénior et au jeune « confirmez ou annulez », mais **seul un admin peut
marquer une rencontre réalisée** (`PATCH /api/interventions/:id/done` est
`requireAdmin`, et c'est elle qui débite le crédit) : les participants
recevaient une demande sans pouvoir y répondre.

**Décision — on relance les admins.** Pas de nouveau droit pour les
participants : laisser un sénior déclencher lui-même le débit de son crédit
est une décision métier sensible, non retenue. Une passe (toutes les 6h)
envoie à chaque admin actif **une** notification et **un** e-mail
récapitulatif (date, sénior, jeune), lien `/admin?tab=rencontres`.

**Décision — quand.** « En retard » = toujours `PROPOSED`/`CONFIRMED` **24h
après la fin** (début + durée), règle unique `shared/meeting-check.ts`
(`isMeetingOverdue`) utilisée par le job, le badge et le filtre « À traiter ».
Les boutons admin, eux, apparaissent dès la fin (`isMeetingEnded`) : le délai
de 24h ne concerne que la relance. Badge réservé aux admins.

**Décision — e-mails en une seule tentative.** Relance des rencontres : la
notification dans l'appli est la garantie (créée avec le marquage, dans une
transaction), l'e-mail est best effort. Rappel de feedback (e-mail seul) :
la rencontre est marquée dès qu'un destinataire a été servi ; si **tous**
les envois échouent (panne Brevo), personne n'a rien reçu et on retente à la
passe suivante, jusqu'à 7 jours après la rencontre (au-delà, abandon
journalisé : sinon une adresse définitivement invalide serait retentée sans
fin). Avant, un échec empêchait le marquage et le destinataire
servi recevait le même e-mail toutes les 6h, sans fin si l'autre adresse
était invalide.

**Processus côté équipe** : `docs/PROCESSUS-RENCONTRES.md`, à transmettre aux
administrateurs FEVES.

## 2026-10-12 — Crédits : réservation à la réservation, une seule rencontre gratuite

**Contexte.** Review avant mise en prod. Le contrôle à la création ne
vérifiait que `solde > 0` : avec 1 crédit, un senior pouvait prévoir 5
ateliers et finir à -4. La « première rencontre gratuite » était décidée par
le seul statut de la relation : deux rencontres courtes créées avant la
première validation passaient toutes deux sans contrôle. Enfin, deux
validations simultanées d'une même rencontre (double clic, deux admins)
débitaient deux crédits.

**Décision — les ateliers prévus réservent un crédit.** Crédits disponibles =
solde du `CreditLedger` − ateliers payants `PROPOSED`/`CONFIRMED`. Une
création exige au moins 1 crédit disponible. Le **débit reste à la
complétion** (règle du 2026-09-07 inchangée) ; annuler un atelier libère sa
réservation. Pas de nouvelle table : la réservation se déduit des rencontres
prévues, comme le solde se déduit du ledger. Le contrôle tourne dans la
transaction de création, sous un verrou advisory par senior
(`credits:<seniorId>`) : sans lui, des réservations simultanées sur des
jeunes différents consommaient le même dernier crédit (reproduit en test).

**Décision — une seule rencontre gratuite par relation, décidée à la
création et mémorisée.** Gratuite si la relation attend sa première
rencontre, si elle dure 30 min ou moins **et** s'il n'existe encore aucune
rencontre non annulée sur la relation (`isFreeMeeting`, `server/storage.ts`).
Le résultat est stocké dans `Intervention.isFree` (migration
`20261012120000_add_intervention_is_free`) : la réservation compte les
rencontres prévues non gratuites, le débit à la complétion lit le drapeau.
Recalculer à la complétion dépendait de l'ordre de clôture (une payante
clôturée avant la gratuite faisait passer la relation ACTIVE, et la gratuite
était débitée à son tour). Si la rencontre gratuite est annulée, le
drapeau passe à la plus ancienne rencontre courte encore prévue sur la
relation (`cancelIntervention`, même transaction), qui libère ainsi son
crédit réservé.

**Décision — clôture idempotente.** `completeIntervention` ne passe à
`COMPLETED_PENDING_FEEDBACK` que si la rencontre est encore `CONFIRMED`, et
`cancelIntervention` ne passe à `CANCELLED` que si elle est encore
`PROPOSED`/`CONFIRMED`, et `confirmIntervention` ne confirme qu'une rencontre
encore `PROPOSED` (mises à jour conditionnelles) ; sinon 409. Une rencontre
ne peut donc être ni débitée deux fois, ni annulée après débit, ni
reconfirmée après annulation.

**Conséquence.** Le solde négatif ne peut plus venir que d'un ajustement
admin après réservation ; l'alerte « Solde de crédits négatif » est conservée
pour ce cas.

## 2026-10-08 — NPS (recommandation du service) pour le financeur

**Contexte.** Le dossier SORTIR + (annexe 1) impose de systématiser le Net
Promoter Score : question « Recommanderiez-vous Lyannaj à votre entourage ? »
(0 à 10) + question qualitative « pourquoi cette note ? », puis lecture en
promoteurs / passifs / détracteurs. Rien n'existait : seule la note 1-5 étoiles
par rencontre (`Intervention.seniorRating`).

**Décision — table séparée `NpsResponse`, jamais de colonne sur
`Intervention`.** Le NPS mesure le service, pas une rencontre. Surtout : toute
colonne ajoutée à `Intervention` est sérialisée par les 3 routes à masquage de
feedback (`/api/meetings/history`, `/api/relations`, `/api/relations/:id`) et
fuirait vers le jeune si on oubliait de la masquer. Une table à part n'est lue
que par les routes NPS.

**Décision — qui répond, quand.** Seniors **et** référents (le référent paie
souvent pour le senior), jamais les jeunes (le NPS jeune mesure une autre
chose : la satisfaction du prestataire). Au plus une réponse par personne tous
les 90 jours (`NPS_COOLDOWN_DAYS`, évite la fatigue d'enquête), et seulement
après au moins une rencontre tenue (`COMPLETED` / `COMPLETED_PENDING_FEEDBACK`)
pour le senior concerné. Éligibilité décidée **côté serveur uniquement**
(`findNpsIneligibility`, `server/storage.ts`) ; le client ne fait que
masquer la carte. Création sous verrou advisory par utilisateur
(`pg_advisory_xact_lock`) : deux envois simultanés ne produisent qu'une ligne.

**Décision — seule la note brute est stockée.** Catégorie (0-6 détracteur,
7-8 passif, 9-10 promoteur) et score (`% promoteurs − % détracteurs`) sont
calculés par `shared/nps.ts`. Segments senior / référent affichés séparément :
deux populations différentes. Contraintes `CHECK` en base (note 0-10, rôle
senior/référent) car Prisma ne sait pas les exprimer et le chiffre part chez le
financeur.

**Décision — restitution : onglet admin + CSV pseudonymisé.** L'onglet
« Satisfaction » affiche le score avec **n** et un avertissement sous 30
réponses (un seul détracteur sur 10 réponses fait −10 points). Les noms y sont
visibles pour que l'équipe puisse rappeler un détracteur ; l'export CSV
(`;` + BOM pour Excel FR) n'en contient aucun — le financeur n'a pas à
identifier les personnes. Pas de rôle « financeur » (enum + gardes + tests de
permissions : trop pour un MVP).

**Compromis assumés.**
- Suppression d'un compte (décision du 2026-10-12) : la **note est conservée,
  anonyme** (`userId` passe à `NULL`, `onDelete: SetNull`) et le **motif libre
  est effacé** (`storage.deleteUser`, même transaction), car il peut identifier
  la personne. Ainsi un bilan déjà transmis au financeur reste reproductible.
  Une note seule, sans lien vers la personne ni texte, n'est plus une donnée
  personnelle. L'onglet admin affiche « Compte supprimé ».
- `GET /api/admin/nps` renvoie toutes les réponses de la période, sans
  pagination. Suffisant à l'échelle actuelle ; à revoir (GROUP BY + page) si
  les volumes grossissent.
- « Plus tard » est mémorisé en `localStorage` (par appareil, 14 jours) pour
  éviter une colonne `User` dans un MVP.
- Pas de rappel e-mail en V1 (déclencheur = carte sur le tableau de bord). À
  ajouter sur le modèle de `meeting-check-reminder.ts` si le taux de réponse
  est faible.
- Le texte du dossier collé s'arrêtait avant le détail des catégories de
  clients : les seuils sont ceux du NPS standard. À confirmer avec le texte
  complet du financeur.

## 2026-09-14 — Paiement en ligne des crédits via Stripe Checkout

**Contexte.** La décision du 2026-09-07 excluait Stripe du MVP (achat 100%
admin manuel). Revenu dessus : le parcours admin-only demandait un
aller-retour humain à chaque achat, non tenable au-delà de quelques seniors.

**Décision — provider abstrait, pas de couplage direct au SDK Stripe.**
`server/lib/payment-provider.ts` définit un contrat (`PaymentProvider`)
indépendant du prestataire ; `server/lib/stripe-provider.ts` l'implémente.
Routes et webhook n'importent jamais `stripe` directement — changer de
prestataire = nouvelle implémentation du contrat + changer l'export dans
`payment-provider.ts`.

**Décision — webhook idempotent, toujours 200 après signature valide.**
`POST /api/webhooks/payment` déduplique par `stripeSessionId` et renvoie 200
même en cas d'erreur métier post-validation, pour éviter que Stripe ne
retente indéfiniment un événement qu'on ne peut de toute façon pas traiter
différemment. Nécessite le body brut (`req.rawBody`, capturé dans
`server/app.ts`) pour la vérification de signature — jamais le body déjà
parsé en JSON.

**Le parcours admin manuel (`POST /api/admin/payments`) reste actif** en
parallèle, pour les cas où un aidant paie hors ligne.

**Non traité par ce changement** (voir `.agents/memory/blockers.md`) : le
solde crédit peut passer négatif si un admin valide deux interventions
`CONFIRMED` coup sur coup sur un solde à 1 — `completeIntervention` ne
revérifie pas le solde au moment du décompte, seule la création le bloque.

## 2026-09-07 — Crédits prépayés : 1 crédit = 1 atelier, décompte à la complétion

**Contexte.** La facturation était 100% manuelle et déclarative : un admin
saisit un `PaymentRecord` (montant + libellé) qui active juste un booléen
`subscriptionActive`, sans aucune notion de quantité ni de contrôle bloquant.
On passe à un modèle où le Senior (ou son aidant) achète un pack de N crédits,
1 crédit = 1 atelier consommé.

**Décision 1 — solde par Senior, historisé.** Le solde de crédits appartient
toujours au Senior, jamais à l'aidant/référent même quand c'est lui qui paie
(`linkedSeniorId` résolu côté route admin). Il est dérivé d'un historique
`CreditLedger` (achats, consommations, ajustements), pas d'un compteur brut,
pour rester justifiable en cas de litige aidant/senior.

**Décision 2 — décompte à la complétion, pas à la création.** Le crédit est
retiré au passage `CONFIRMED` → `COMPLETED_PENDING_FEEDBACK`
(`storage.completeIntervention`), le seul point de non-retour du cycle de vie
actuel (`CANCELLED` n'est plus possible après). Décrémenter plus tôt aurait
demandé une logique de remboursement en cas d'annulation.

**Décision 3 — première rencontre gratuite sous 30 minutes.** La toute
première rencontre d'une relation (`PENDING_FIRST_MEETING`) ne consomme pas de
crédit tant que sa durée prévue ne dépasse pas 30 minutes ; au-delà, elle est
traitée comme n'importe quelle rencontre suivante. Seule la durée **prévue** à
la création compte, jamais une durée réelle mesurée après coup.

**Décision 4 — blocage à la création, pas à la complétion.** Solde à 0 → 402
sur les trois chemins de création d'intervention, avec message et code
`INSUFFICIENT_CREDITS`. Un solde négatif au moment de la complétion (cas des
rencontres déjà engagées avant l'introduction du système) n'est pas bloqué :
il documente une dette plutôt que de figer une intervention déjà confirmée
sans porte de sortie.

**Pas de paiement en ligne.** L'achat reste un geste admin via le formulaire
`POST /api/admin/payments` existant, étendu d'un champ `credits` optionnel —
cohérent avec la cible (seniors peu digital-native, aidants souvent payeurs à
distance) et évite d'introduire Stripe/checkout pour ce MVP.

## 2026-08-13 — Historique des rencontres : endpoint unique et feedbacks cloisonnés

**Contexte.** Chaque rôle devait disposer d'un historique/récap des rencontres
(service, heures, personne rencontrée, date et heure, feedback). L'historique
existait déjà **quatre fois**, implémenté indépendamment dans `home.tsx`,
`teacher.tsx`, `referent.tsx` et `admin.tsx`, avec une couverture inégale :
seul l'admin avait l'export CSV, le référent n'affichait ni durée ni heure,
aucune vue ne montrait de total d'heures.

**Décision 1 — une seule source.** `GET /api/meetings/history` sert les cinq
rôles, avec `storage.getMeetingHistory(scope, filters)` côté données et
`client/src/components/meeting-history.tsx` côté rendu. Le périmètre dérive
**toujours** de `req.user` : `?userId=` est réservé à l'admin et au professeur
pour ses seuls élèves affiliés (403 sinon), et n'élargit jamais le périmètre.

**Décision 2 — visibilité des feedbacks au moindre privilège.** Jeune et sénior
ne voient que leur propre note et commentaire ; le référent voit celui de son
sénior affilié mais pas celui du jeune ; admin et professeur voient les deux.

Le masquage est fait **serveur, avant sérialisation** (`scopeFeedback` et
`scopeInterventionFeedback` dans `server/routes.ts`), pas par affichage
conditionnel : la réponse JSON ne doit pas transporter un commentaire que
l'appelant n'a pas le droit de lire.

Trois routes servent ces feedbacks et sont toutes filtrées :
`/api/meetings/history`, `/api/relations` et `/api/relations/:id`. Les deux
routes relations les renvoyaient en clair — ne filtrer que l'historique aurait
rendu la règle contournable en ouvrant la fiche relation. Conséquence assumée :
le sénior ne voit plus le commentaire du jeune sur la fiche relation, alors
qu'il le voyait avant.

**Notion de « service ».** C'est le champ `tasks` de l'intervention, soit les
ateliers de `shared/ateliers.ts`. Aucun champ `service` distinct n'a été
introduit : ce serait un doublon du modèle existant.

**Piège du récap.** `summary.byService` compte la durée entière d'une rencontre
pour *chacun* de ses ateliers. La somme par service dépasse donc légitimement
`totalMinutes` — ce sont des heures par service, pas une partition, d'où le
libellé « Heures par service ». Seuls les statuts `COMPLETED` et
`COMPLETED_PENDING_FEEDBACK` sont comptabilisés : une rencontre annulée ou
simplement proposée ne représente aucune heure passée.

**Pas de migration.** Les index existants (`Intervention @@index([relationId,
status])`, `Relation @@index([seniorId, status])` et `([juniorId, status])`)
couvrent ces accès.

## 2026-08-12 — Affichage des dates : heure Guadeloupe obligatoire

**Contexte.** Le développement se fait depuis la France métropolitaine
(Europe/Paris, avec changement d'heure), les utilisateurs sont en Guadeloupe
(UTC-4 fixe, sans changement d'heure), et le serveur Render tourne en UTC.
Trois fuseaux différents pour une même donnée.

**Problème.** L'heure des rencontres n'était pas affichée dans l'espace jeune.
L'ajouter avec `toLocaleTimeString` aurait rendu l'heure du navigateur : une
rencontre à 14h30 en Guadeloupe s'affichait 20h30 depuis Paris. Côté serveur
(notifications, e-mails), une rencontre à 21h heure Guadeloupe tombe le
lendemain 01h UTC — le mauvais **jour** était annoncé, pas seulement la
mauvaise heure.

**Décision.** `shared/dates.ts` est la source unique de formatage des dates
métier. Aucun appel `toLocaleDateString` / `toLocaleTimeString` sur
`scheduledDate`, `startAt` ou `endAt`, ni côté client ni côté serveur.

Helpers disponibles : `gpParts`, `fmtTime` ("14h30"), `fmtDayShort`,
`fmtDayLongMonth` ("mercredi 19 août"), `fmtDayLongMonthYear`,
`fmtDayNumeric` ("19/08/2026"), `gpDateTimeToUtc`. Le client y accède via
`client/src/lib/availability-format.ts` (simple ré-export).

**Le stockage n'était pas en cause** : les créneaux passent déjà par
`gpDateTimeToUtc`, `scheduledDate` est un instant UTC correct. Le correctif
portait uniquement sur l'affichage.

**Limite assumée.** L'offset UTC-4 est figé dans `GP_OFFSET_MS`. Ce code est
correct en Guadeloupe et faux partout où le DST s'applique. Toute extension
hors de l'archipel impose de passer à une implémentation à timezone
paramétrable (`Intl.DateTimeFormat` ou `date-fns-tz`).

**Hors périmètre.** Les dates purement administratives (`createdAt`,
`birthDate`, horodatage de la messagerie) restent en `toLocale*`. Même piège
si elles doivent un jour être exactes à l'heure près.
