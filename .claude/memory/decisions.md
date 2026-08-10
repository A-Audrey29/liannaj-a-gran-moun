# Décisions — FEVES

## 2026-08-10 — dotenv en dépendance explicite

**Contexte :** `server/index.ts`, `prisma.config.ts` et `prisma/seed.ts` importent
`dotenv/config`, mais le paquet n'était ni dans `dependencies` ni `devDependencies` —
présent uniquement via résolution transitive d'un autre paquet.

**Décision :** `npm install dotenv` en dependency explicite.

**Pourquoi :** un `npm ci` aurait pu casser au démarrage prod si le paquet transitif
disparaissait — même famille de risque que le blocker `prisma generate`/`postinstall`
déjà corrigé (commit `706a543`).

**Impact :** `package.json`, `package-lock.json`.

## 2026-08-10 — .gitignore durci pour .env

**Décision :** ajout explicite de `.env` / `.env.*` / `!.env.example` au `.gitignore`.

**Pourquoi :** `.env` n'a jamais été commité (vérifié dans tout l'historique git), mais
la protection était implicite. Rendue explicite pour éviter tout risque futur.

## 2026-08-10 — TeacherStudent = source de vérité pour le prof référent du jeune

**Contexte :** deux systèmes distincts pour "le prof d'un jeune" existaient sans le
vouloir — `referentTitle`/`referentFirstName`/`referentLastName`/`referentEmail` (texte
libre saisi à l'inscription, `referentEmail` sert aussi de `validatorEmail` à
l'inscription uniquement) vs `TeacherStudent` (lien vers un vrai compte `TEACHER`, géré
par l'admin).

**Décision :** dès qu'un `TeacherStudent` existe pour un jeune, l'affichage (côté jeune
et côté admin) utilise le nom/email du compte `TEACHER` lié, en lecture seule pour le
jeune. Tant qu'aucun lien n'existe, l'ancien texte libre reste affiché et éditable
(fallback). Les valeurs texte libre en base ne sont jamais écrasées par la liaison —
seul l'affichage change, donc délier fait réapparaître l'ancien texte tel quel.

**Écarté :** fusionner purement les deux systèmes (supprimer le texte libre) — rejeté
car un jeune peut avoir un référent qui n'a pas encore de compte `TEACHER` dans l'app
au moment de l'inscription.

**Impact :** `server/routes.ts` (`GET /api/auth/me` enrichi de `linkedTeacher`),
`client/src/hooks/use-auth.ts`, `client/src/pages/home.tsx`, `client/src/pages/admin.tsx`.

## 2026-08-10 — Auto-liaison TeacherStudent par correspondance d'email

**Contexte :** suite à la décision ci-dessus, créer le lien `TeacherStudent` à la main à
chaque fois (via le sélecteur admin) était un frein — l'admin devrait le faire pour
chaque jeune individuellement.

**Décision :** le lien se crée automatiquement dans deux cas, par correspondance exacte
d'email (case-insensitive) :
1. À l'inscription d'un jeune (`POST /api/auth/register`) : si `referentEmail` correspond
   à un compte `TEACHER` actif déjà existant → lien créé immédiatement.
2. À la création d'un prof (`POST /api/admin/teachers`) : tous les `JUNIOR` dont
   `referentEmail` correspond à ce nouvel email, et qui n'ont **pas déjà** de lien →
   lien créé rétroactivement.

**Garde-fou :** l'auto-lien ne s'exécute jamais si un lien existe déjà pour ce jeune —
ne peut donc jamais écraser un choix manuel de l'admin. Testé explicitement (lien manuel
→ création d'un 2e prof avec le même email référent → lien manuel préservé).

**Le sélecteur admin manuel reste disponible** pour corriger une faute de frappe ou un
cas ambigu — l'auto-lien couvre le cas courant, pas tous les cas.

**Impact :** `server/storage.ts` (`getJuniorsByReferentEmail`), `server/routes.ts`
(deux points d'insertion dans register et create-teacher).
