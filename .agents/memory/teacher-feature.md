---
name: Teacher feature
description: Ajout du rôle TEACHER, gestion élèves et commentaires profs dans FEVES
---

## Rôle TEACHER

Ajouté à l'enum `Role` dans `prisma/schema.prisma` et `shared/schema.ts`.

**Why:** Les professeurs référents ont besoin de suivre leurs élèves (juniors), voir les séniors affiliés, éditer la bio, noter des commentaires internes FEVES.

## Modèles Prisma ajoutés

- `TeacherStudent` — table pivot teacher↔junior (unique par paire)
- `TeacherComment` — notes internes, visibles TEACHER + ADMIN uniquement

## Modèle retiré : Internship (stages)

Ajouté avec le reste de la Teacher feature, retiré le 2026-09-16 : le suivi
de stages est hors sujet Lyannaj (association FEVES = mise en relation
seniors/jeunes bénévoles, pas suivi pédagogique de stages scolaires).
Aucun usage réel (routes teacher CRUD jamais appelées côté client,
seul l'onglet admin "Stages" en lecture seule les affichait). Voir
`prisma/migrations/20260916000000_remove_internship/` (down.sql pour
rollback manuel si besoin).

## Routes API

- `/api/teacher/*` — protégées par `requireTeacher` middleware (role === "TEACHER")
- `/api/admin/teachers/*` — CRUD teachers + gestion affiliations + lecture comments
- Endpoint bio dédié `PATCH /api/teacher/students/:id/bio` — ne touche pas la route PATCH /api/users/:id existante

## Frontend

- Page `/espace-professeur` → `client/src/pages/teacher.tsx`
- Route ajoutée dans `client/src/App.tsx`
- 2 onglets admin dans `admin.tsx` : Professeurs, Notes profs
- Onglet "Créer un prof" dans admin

## Migration DB

- Utilisé `prisma db push --accept-data-loss` (pas `migrate dev`) car drift détecté — le projet n'a pas de migration history.
- La perte de données = uniquement la table `session` (sessions actives perdues, OK en dev).

**How to apply:** Pour toute modification future du schéma, utiliser `prisma db push --accept-data-loss` ou établir une vraie migration history.
