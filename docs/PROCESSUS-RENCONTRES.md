# Processus — clôture des rencontres

Pour : l'équipe administratrice FEVES qui gère Lyannaj au quotidien.

## Le principe

**Dans le cas normal, l'équipe n'a rien à faire.**

- Après la rencontre, le **sénior** (ou son **aidant**) appuie sur
  **« La rencontre a eu lieu »**.
- S'il ne le fait pas, la rencontre est **clôturée automatiquement 48 heures
  après sa fin**, à condition que le jeune l'ait confirmée.

Une rencontre clôturée **décompte un crédit** du sénior (sauf la toute
première rencontre gratuite) et déclenche la demande d'avis aux deux
participants. C'est la même chose quel que soit l'auteur de la clôture.

L'équipe garde le **contrôle a posteriori** : elle voit qui a clôturé
chaque rencontre et peut corriger.

## Le cycle d'une rencontre

1. **Proposée** : le sénior (ou un admin pour la première rencontre)
   propose une date.
2. **Confirmée** : le jeune accepte.
3. **La rencontre a lieu.**
4. **Clôture**, par la première de ces actions :
   - le sénior ou son aidant appuie sur **« La rencontre a eu lieu »**
     (le bouton apparaît dès la fin de la rencontre) ;
   - un admin clique **« Marquer réalisée »** dans *Admin → Rencontres* ;
   - sans action de personne, **48 heures après la fin**, la plateforme la
     clôture seule.

Le sénior peut aussi **annuler** une rencontre qui n'a pas eu lieu : aucun
crédit n'est décompté.

## Ce que l'équipe voit et peut corriger

Dans *Admin → onglet Rencontres*, chaque rencontre clôturée indique **qui
l'a clôturée et quand** :

- « Déclarée réalisée par le senior (nom) » ;
- « Déclarée réalisée par l'aidant (nom) » ;
- « Marquée réalisée par l'équipe (nom) » ;
- « Clôturée automatiquement (48 h après la fin, sans déclaration du senior) ».

Le bouton **« N'a pas eu lieu »** corrige une clôture à tort : la rencontre
passe « annulée » et **le crédit est rendu** au sénior. Le sénior et le jeune
sont prévenus.

À chaque passage de la clôture automatique, les administrateurs reçoivent
**une notification** « Rencontres clôturées automatiquement », avec le
nombre de rencontres concernées. Pas d'e-mail : c'est une information, pas
une action à faire.

## Le seul cas où l'équipe doit agir : la rencontre jamais confirmée

Une rencontre restée **« proposée »** (le jeune n'a jamais confirmé) ne se
clôture pas seule : on ne sait pas si elle a eu lieu.

Si elle est **terminée depuis plus de 24 heures**, tous les administrateurs
actifs reçoivent :

- une **notification** « Rencontres à clôturer » ;
- un **e-mail récapitulatif** (date, sénior, jeune), avec un bouton qui
  ouvre l'onglet Rencontres.

Chaque rencontre n'est signalée **qu'une fois**. Elle reste ensuite visible
avec le badge rouge **« En retard »** et le filtre **« À traiter (N) »**.

Que faire :

1. Ouvrir *Admin → Rencontres*, filtre **« À traiter »**.
2. Vérifier avec le sénior ou le jeune si elle a eu lieu.
3. Cliquer **« Marquer réalisée »** (possible même sans confirmation du
   jeune) ou **« Annuler »**.

Tant qu'elle n'est pas traitée, le crédit du sénior reste **réservé** et les
participants ne peuvent pas donner leur avis.

---

*Côté technique : règles dans `shared/meeting-check.ts`, clôture dans
`server/lib/meeting-completion.ts`, clôture automatique dans
`server/lib/meeting-auto-complete.ts`, relance dans
`server/lib/meeting-check-reminder.ts`. Décisions dans `docs/decisions.md`
(2026-10-12, 2026-11-10).*
