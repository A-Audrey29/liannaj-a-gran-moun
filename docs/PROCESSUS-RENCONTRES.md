# Processus — clôture des rencontres

Pour : l'équipe administratrice FEVES qui gère Lyannaj au quotidien.

## Le principe

**Seul un administrateur peut marquer une rencontre comme réalisée.**
Ni le sénior, ni le jeune, ni le référent ne peuvent le faire eux-mêmes.

C'est volontaire : marquer une rencontre « réalisée » **décompte un crédit**
du sénior (sauf la toute première rencontre gratuite) et déclenche la demande
d'avis (feedback) aux deux participants. Cette action reste donc entre les
mains de l'équipe.

## Le cycle d'une rencontre

1. **Proposée** : le sénior (ou un admin pour la première rencontre)
   propose une date.
2. **Confirmée** : le jeune accepte.
3. **La rencontre a lieu.**
4. **Un admin la clôture** dans *Admin → onglet Rencontres* :
   - **Marquer réalisée** → le crédit est décompté, les deux participants
     sont invités à donner leur avis ;
   - **Annuler** → aucun crédit décompté, le sénior et le jeune sont
     prévenus de l'annulation.

Les boutons apparaissent **dès la fin de la rencontre** (heure de début +
durée prévue). Pas besoin d'attendre : si un participant appelle juste après
pour dire que tout s'est bien passé, on peut clôturer tout de suite.

« Marquer réalisée » n'est possible que si la rencontre a été **confirmée**
par le jeune. Une rencontre restée « proposée » ne peut qu'être annulée.

## Quand êtes-vous prévenus ?

Si une rencontre est **terminée depuis plus de 24 heures** et n'a toujours
pas été clôturée, tous les administrateurs actifs reçoivent :

- une **notification** dans l'application : « Rencontres à clôturer »,
  avec le nombre de rencontres concernées ;
- un **e-mail récapitulatif** listant la date, le sénior et le jeune de
  chaque rencontre, avec un bouton qui ouvre directement l'onglet
  Rencontres.

La vérification tourne **toutes les 6 heures**. Chaque rencontre n'est
signalée **qu'une seule fois** : si vous ne la traitez pas, elle reste
visible dans l'onglet Rencontres avec le badge rouge **« En retard »** et le
filtre **« À traiter (N) »**, mais vous ne recevrez pas de nouveau rappel
pour elle.

Les participants, eux, ne reçoivent **aucune** relance à ce sujet : ils ne
peuvent rien faire, c'est à l'équipe d'agir.

## Que faire quand vous recevez « Rencontres à clôturer »

1. Ouvrir *Admin → Rencontres* (lien direct dans l'e-mail), filtre
   **« À traiter »**.
2. Pour chaque rencontre, vérifier avec le sénior ou le jeune qu'elle a bien
   eu lieu (téléphone, message).
3. Cliquer **« Marquer réalisée »** ou **« Annuler »**.

Tant qu'une rencontre n'est pas clôturée :

- le crédit du sénior reste **réservé** : il ne peut pas l'utiliser pour
  réserver un autre atelier ;
- les participants ne peuvent pas donner leur avis ;
- l'enquête de satisfaction (NPS) n'est pas proposée au sénior s'il n'a
  encore aucune rencontre réalisée.

Clôturer rapidement compte donc pour le sénior comme pour les chiffres
transmis au financeur.

## Si l'e-mail n'arrive pas

L'e-mail n'est envoyé **qu'une fois** ; s'il échoue (adresse invalide, panne
du service d'envoi), il n'est pas renvoyé. La notification dans
l'application, elle, est toujours créée. Pensez à consulter vos
notifications et le filtre « À traiter » régulièrement.

---

*Côté technique : règle dans `shared/meeting-check.ts`, envoi dans
`server/lib/meeting-check-reminder.ts`, décision dans `docs/decisions.md`
(2026-10-12).*
