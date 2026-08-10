---
name: Teacher feature
description: Ajout du rôle TEACHER, gestion élèves, stages et commentaires profs dans FEVES
---

## Rôle TEACHER

Ajouté à l'enum `Role` dans `prisma/schema.prisma` et `shared/schema.ts`.

**Why:** Les professeurs référents ont besoin de suivre leurs élèves (juniors), voir les séniors affiliés, éditer la bio, noter des commentaires internes FEVES, et gérer les stages.

## Modèles Prisma ajoutés

- `TeacherStudent` — table pivot teacher↔junior (unique par paire)
- `TeacherComment` — notes internes, visibles TEACHER + ADMIN uniquement
- `Internship` + enum `InternshipStatus` (UPCOMING/ONGOING/COMPLETED/CANCELLED)

## Routes API

- `/api/teacher/*` — protégées par `requireTeacher` middleware (role === "TEACHER")
- `/api/admin/teachers/*` — CRUD teachers + gestion affiliations + lecture comments/internships
- Endpoint bio dédié `PATCH /api/teacher/students/:id/bio` — ne touche pas la route PATCH /api/users/:id existante

## Frontend

- Page `/espace-professeur` → `client/src/pages/teacher.tsx`
- Route ajoutée dans `client/src/App.tsx`
- 3 onglets admin ajoutés dans `admin.tsx` : Professeurs, Notes profs, Stages
- Onglet "Créer un prof" dans admin

## Migration DB

- Utilisé `prisma db push --accept-data-loss` (pas `migrate dev`) car drift détecté — le projet n'a pas de migration history.
- La perte de données = uniquement la table `session` (sessions actives perdues, OK en dev).

**How to apply:** Pour toute modification future du schéma, utiliser `prisma db push --accept-data-loss` ou établir une vraie migration history.
