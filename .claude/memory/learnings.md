# Apprentissages — FEVES

## Merger une PR ne touche jamais la vraie base de données

Fusionner une PR qui modifie `prisma/schema.prisma` ne change rien côté DB tant que
`prisma db push` (dev) ou une vraie migration (prod) n'a pas été lancé séparément. Après
le merge de la feature "espace professeur", le lien "ESPACE PROFESSEUR" n'apparaissait
pas — la base de dev n'avait simplement pas encore les nouvelles tables
(`TeacherStudent`, `TeacherComment`, `Internship`) ni la valeur d'enum `TEACHER`.

## Prisma refuse par défaut une perte de données, même sur une table qu'il ne gère pas

`prisma db push` a bloqué en voulant DROP la table `session` — mais cette table
appartient à `connect-pg-simple` (`createTableIfMissing: true` dans `server/auth.ts`),
pas à Prisma. Prisma la voit comme orpheline car absente de `schema.prisma`, et refuse
de la supprimer sans `--accept-data-loss`. Comportement normal, pas un bug : à chaque
`db push`, vérifier QUELLE table serait droppée avant d'accepter — ici sans risque
(recréée automatiquement au démarrage), mais ce ne sera pas toujours le cas.

## Rebaser une branche Replit longtemps à part peut se passer sans conflit

`feature/espace-professeur` (5 commits sur Replit) et `main` (9 commits de fixes sécu)
avaient divergé sur des zones de code presque disjointes — vérifié via
`git diff --stat <merge-base> <branche>` avant de rebaser. Rebase réel : zéro conflit.
Vérifier les zones de recouvrement avant de rebaser évite les mauvaises surprises et
permet de prédire le résultat avec confiance.

## Le hot-reload de tsx ne recharge pas toujours proprement les changements de schéma Zod partagé

Après avoir ajouté `referentEmail` à `updateProfileSchema` (`shared/schema.ts`), le
serveur dev tournant en hot-reload continuait de rejeter/ignorer le champ. Un restart
propre (`pkill` + relance) a résolu le problème. Réflexe à avoir : si un changement dans
`shared/` ne semble pas pris en compte côté serveur pendant un test, redémarrer avant de
chercher un bug ailleurs.
