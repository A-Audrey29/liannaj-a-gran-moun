# Roadmap — idées validées, pas encore planifiées

## Auto-inscription référent sénior / professeur avec mot de passe temporaire

Actuellement (2026-09-16) : seul l'admin crée les comptes REFERENT_SENIOR et
TEACHER, via le dialog "Créer un utilisateur" dans l'onglet Utilisateurs
(`client/src/pages/admin.tsx`, `CreerCompteTab`). Charge manuelle pour
l'admin à chaque nouveau référent/prof.

Idée proposée : permettre à ces rôles de s'auto-inscrire, avec un mot de
passe temporaire envoyé par email (à usage unique, expirant), forçant un
changement de mot de passe à la première connexion.

Pourquoi pas fait tout de suite : chantier significatif — génération de
token unique-use expirant, nouveau template email Brevo, nouvelle page
front "définir mon mot de passe", véritable flow de sécurité à durcir
(pas juste un CRUD). Mérite sa propre session de planification plutôt que
d'être ajouté en aparté à un refactor d'admin.

Décision utilisateur (2026-09-16) : reporté, traité comme tâche séparée
plus tard.
