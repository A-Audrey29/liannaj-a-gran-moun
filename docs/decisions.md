# Décisions techniques

Journal des choix d'architecture et de leurs raisons. Une entrée par décision,
la plus récente en haut.

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
