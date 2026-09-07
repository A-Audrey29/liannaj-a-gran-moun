# Décisions techniques

Journal des choix d'architecture et de leurs raisons. Une entrée par décision,
la plus récente en haut.

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
