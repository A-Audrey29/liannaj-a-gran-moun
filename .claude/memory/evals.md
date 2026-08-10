# Évaluations / mesures — FEVES

## Typecheck (`npx tsc --noEmit`)

| Date | Erreurs | Détail |
|---|---|---|
| 2026-08-10 (avant tout changement) | 25 | 100% `server/routes.ts`, `req.params` typé `string \| string[]` (Express 5) |
| 2026-08-10 (après merge espace-professeur) | 28 | +3, même cause, nouveau code teacher en fin de fichier |
| 2026-08-10 (après sélecteur admin prof référent) | 30 | +2, même cause, nouvelles routes `/api/admin/users/:id/teacher` |
| 2026-08-10 (après sync TeacherStudent + auto-lien) | 30 | inchangé, aucune régression |

Racine commune : Express 5 type `req.params.id` comme `string | string[]` (Express 4
le typait `string`). Correction prévue mais pas encore faite : helper `param(req, name)`
qui gère le cas tableau, à appliquer aux ~30 emplacements de `server/routes.ts` (voir
plan Claude Code setup pour le détail — PR séparée du reste).
