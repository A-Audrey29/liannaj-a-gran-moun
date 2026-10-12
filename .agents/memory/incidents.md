# Incidents — base de données

## 2026-10-07 — `prisma migrate dev` lancé sans confirmation, connecté direct sur Neon prod

**Ce qui s'est passé** : en préparant une nouvelle migration (ajout du champ
`meetingCheckReminderSentAt` sur `Intervention`), j'ai lancé
`npx prisma migrate dev --name add_meeting_check_reminder --create-only`
en pensant que `--create-only` se contentait de générer le SQL sans y toucher.
En réalité `migrate dev` **vérifie et applique d'abord les migrations en
attente** avant de proposer la nouvelle — `--create-only` ne protège que la
migration qu'on est en train de créer, pas celles déjà en attente.

Une migration en attente (`20260916000000_remove_internship`) a donc été
appliquée automatiquement, avec un warning affiché juste avant exécution :
`You are about to drop the 'session' table, which is not empty (3 rows)`.
Prisma a ensuite refusé de continuer (`environment is non-interactive`),
donc rien n'a été réellement exécuté après ce point — mais la migration en
attente, elle, a bien été poussée.

**Pourquoi ça a pu arriver** : `.env` pointe directement sur la base Neon de
prod (hôte Neon volontairement non cité : dépôt public) — il n'y a **pas de base locale séparée
pour le développement**. Toute commande Prisma lancée dans ce repo, y
compris pour explorer ou préparer une migration, parle à la vraie base.

**Vérification post-incident** : table `session` toujours présente,
toujours 3 lignes — pas de perte de données malgré le warning. Le drop
annoncé par le warning n'a en fait pas eu lieu (la commande s'est arrêtée
avant d'exécuter le SQL de la migration suivante).

**Correction du 2026-10-12** : `npx prisma migrate status` (lecture seule)
sur Neon indique « Database schema is up to date » avec
`20261007111325_add_meeting_check_reminder` comprise. Cette migration est
donc bien appliquée sur Neon (par cet incident ou plus tard, impossible à
dire). Conséquence : son fichier SQL ne doit plus être modifié, et son
rollback est documenté dans `docs/DATABASE.md`.

**Root cause** : mauvaise hypothèse sur ce que fait `--create-only`, combinée
à l'absence d'environnement de dev isolé. Aucune des deux règles
"jamais `migrate dev`/`db push` sur la base avec des données réelles" n'a été
vérifiée avant de taper la commande — l'erreur est humaine (enfin,
assistant), pas un manque de documentation : la règle existait déjà dans
CLAUDE.md et a été ignorée dans le feu de l'action.

## Règle pour que ça ne se reproduise pas

- **Jamais** de `prisma migrate dev` (avec ou sans `--create-only`) tant que
  `.env` pointe sur Neon. Pour générer le SQL d'une migration sans y toucher,
  utiliser `prisma migrate diff` (lecture seule, ne touche jamais la base) ou
  écrire le SQL de migration à la main dans `prisma/migrations/<timestamp>_<nom>/migration.sql`.
- **Avant toute commande `prisma migrate *`** : lancer `npx prisma migrate status`
  d'abord pour voir s'il y a des migrations en attente — si oui, s'arrêter et
  demander confirmation avant d'aller plus loin, quelle que soit la commande
  prévue ensuite.
- Envisager une vraie base Postgres locale pour le développement (séparée de
  Neon), ne serait-ce que pour que ce genre d'exploration soit sans risque.
  Pas fait à ce jour — à soulever avec l'utilisatrice si le sujet revient.
