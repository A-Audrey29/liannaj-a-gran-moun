# Blockers connus — à traiter avant/à la mise en prod

Trouvés lors de la session QA du 2026-09-09/10 (test exhaustif des 5 rôles).
Pas bloquants pour continuer à développer, mais à traiter avant un vrai
déploiement prod avec données réelles.

## 1. Solde crédit peut aller négatif à la validation admin

`storage.completeIntervention()` ([server/storage.ts:643](../../server/storage.ts#L643))
décrémente 1 crédit sans vérifier que le solde reste >= 0. Le contrôle existe
seulement à la **création** de l'intervention (`createInterventionOrConflict`,
[server/routes.ts:362](../../server/routes.ts#L362)), pas à la complétion.

Scénario : un sénior à 1 crédit a 2 interventions `CONFIRMED` simultanées
(possible si créées avant que le solde ne descende à 0). Si l'admin valide
les deux coup sur coup, le solde passe à -1.

Risque : faible (action manuelle admin, pas de concurrence automatique).
Impact : `CreditLedger` techniquement incohérent, correction manuelle possible.

Fix probable : vérifier le solde dans la même transaction que le décompte
dans `completeIntervention`, refuser si insuffisant (sauf 1ère rencontre
gratuite).

## 2. CTA "Proposer une rencontre" sans état vide explicite

Le calendrier de disponibilités du jeune (`AvailabilityWeekPicker` sur
`relation-detail.tsx`) n'affiche aucun message si le jeune n'a renseigné
aucune disponibilité — juste des tirets "—" sur chaque jour, sans
explication. Le sénior ne comprend pas pourquoi rien n'est cliquable.

Fix : ajouter un message du type "Marie n'a pas encore indiqué ses
disponibilités" quand `freeSlots` est vide sur toute la semaine affichée.

## 3. `/api/admin/referents` sans vérif du statut du sénior lié

[server/routes.ts:2198](../../server/routes.ts#L2198) vérifie
`senior.role === "SENIOR"` mais pas `senior.status === "ACTIVE"`. Le
formulaire admin filtre déjà côté client (`/api/admin/seniors/active`),
donc **non exploitable via l'UI normale** — vérifié en bypassant l'UI avec
un fetch direct, un référent a pu être lié à un sénior `PENDING_VALIDATION`.

Risque : faible (nécessite un accès admin + appel API direct).
Fix : ajouter la vérif `status === "ACTIVE"` dans le handler, en profondeur.

## 4. Interventions passées restent CONFIRMED/PROPOSED sans transition automatique

Trouvé lors de la session QA du 2026-09-17 (exhaustive, 5 rôles).

Rien ne fait transitionner une intervention `CONFIRMED` ou `PROPOSED` dont
`scheduledDate` est déjà passée. Sur les données de seed, 2 cas observés
(16 sept CONFIRMED, 14 sept PROPOSED, testé le 17 sept). Corrigé en surface
par [ISSUE-001](../../.gstack/qa-reports/qa-report-lyannaj-2026-09-17.md)
(le dashboard ne les affiche plus comme "prochaine rencontre"), mais le
fond du problème reste : pas de job/check qui les fait avancer vers
`COMPLETED_PENDING_FEEDBACK` ou un état "à clôturer".

À trancher : est-ce voulu (transition seulement sur action manuelle
junior/senior) ou faut-il un mécanisme de relance/clôture automatique ?

## Zones jamais testées (ni QA manuelle ni agent)

- Flow de déclenchement d'un signalement (senior/junior qui signale un
  problème) — seule la liste (vide) côté admin a été vue.
- Notifications push (web-push/VAPID) — clés VAPID sont des placeholders
  dans `.env`, probablement pas testable en local en l'état.
- SSE temps réel — la messagerie a été testée en refetch/polling, jamais
  vérifié qu'un message arrive en direct entre deux onglets sans refresh.
- Upload de photo de profil avec resize sharp/WebP — jamais testé avec un
  vrai fichier.
- Fermeture de relation (`button-fermer-relation` sur relation-detail) —
  bouton vu, comportement jamais vérifié (historique, crédits engagés).
- Un 500 isolé sur `GET /api/relations` vu une fois après une pause longue
  de session (possible connexion Neon qui se repose après idle), jamais
  reproduit au retry. À surveiller si ça revient en usage réel.
