# Décisions techniques

Journal des choix d'architecture et de leurs raisons. Une entrée par décision,
la plus récente en haut.

## 2026-10-20 — Accessibilité et mobile-first

Public visé : seniors (vue et dextérité réduites) et jeunes (téléphone d'abord).

**Constat.** Audit axe-core (WCAG 2.2 AA) + Playwright sur 63 états en 320 /
375 / 414 px : zoom bloqué, fenêtre NPS coupée sur petit écran, page profil
jeune qui défilait en horizontal, boutons-icônes sans nom, rouge de marque
`#dc4256` à 4,2:1 (il faut 4,5:1).

**Décisions.**
- **Rouge de marque `#c0354a`** (5,5:1 sur blanc, 4,7:1 sur le fond lavande
  `#f3eaff`), survol `#a82b3d`. `--primary` suit (`351 57% 48%`). Violet de
  texte `#6d28d9`, violet de fond `#7c3aed`. Ne pas revenir à `#dc4256` : un
  test le vérifie. Les e-mails (`server/lib/email-templates.ts`) gardent
  l'ancien rouge : hors de ce périmètre, à aligner plus tard.
- **Cibles tactiles 44 px sur mobile, compactes dès `md`** : `Button`,
  `Input`, `Select`, `Tabs` en `min-h-11 md:min-h-9`. Le desktop garde sa
  densité.
- **Dialogues défilants** (`max-h-[calc(100dvh-2rem)] overflow-y-auto`) :
  un dialogue plus haut que l'écran rendait le bouton « Envoyer » du NPS
  inatteignable.
- **Pas de contrôle qui n'existe qu'au survol** : les actions photo étaient
  en `opacity-0 group-hover`, donc invisibles au doigt.
- **`UserAvatar` pour toute photo de profil** (repli sur les initiales) :
  `getPhotoUrl` renvoie `undefined` pour les anciennes URLs ui-avatars, un
  `<img>` nu affichait alors son texte alternatif.
- **`Badge` est `whitespace-nowrap`** : pour un texte libre (nom d'atelier),
  ajouter `h-auto whitespace-normal text-left`. Un badge en `absolute` doit
  porter `no-default-hover-elevate` (sinon `.hover-elevate` le repasse en
  `position: relative`).
- **Texte minimum 12 px** (`text-xs`), jamais `text-[9..11px]`.
- **Images de la landing en WebP 720 px** (2,9 Mo → 134 Ko), `loading="lazy"`
  sous la ligne de flottaison.

**Garde-fous.** `tests/accessibilite-mobile.test.ts` (contrôles statiques).
Avant une mise en production, relancer un passage axe + Playwright sur
320 / 375 / 414 px : les tests statiques ne voient pas le rendu.

**Non traité.** Cibles tactiles des liens dans le texte courant (24 px WCAG
atteints, 44 px non), filtres admin à 30 px, titre de page « FEVES - lyannaj a
gran moun » (nom produit à trancher).

## 2026-10-19 — Disponibilités du jeune : planning mémorisé, prolongation, rappel

Demande d'Audrey : les disponibilités d'un jeune « expiraient » sans prévenir.

**Pourquoi elles s'arrêtent.** Le planning habituel n'est pas stocké comme une
règle : à l'enregistrement, le serveur génère des créneaux datés pour N
semaines (4 par défaut, plafond 90 jours posé à la relecture du 2026-08-11
contre une boucle sans fin). Après la dernière date, plus aucun créneau, donc
plus aucune proposition possible. Le formulaire revenait vide : prolonger
voulait dire tout ressaisir. Seul un bandeau dans l'onglet prévenait.

**Décision.**
- Le planning est mémorisé sur le jeune (`User.availabilityTemplate`, JSON),
  dans la même transaction que les créneaux. Le formulaire est pré-rempli.
- Bouton « Prolonger de 4 semaines » (`POST /api/availabilities/extend`) : le
  même planning est ajouté après le dernier créneau (ou à partir d'aujourd'hui
  s'ils sont tous passés). Rien n'est effacé, aucun créneau n'est créé sur une
  absence déclarée, plafond de 90 jours après aujourd'hui conservé.
- Rappel 7 jours avant la fin (notification + e-mail, lien vers l'onglet),
  une fois par date de fin (`User.availabilityReminderSentAt`,
  `isAvailabilityReminderDue` dans `shared/availability.ts`). Job toutes les
  6 h dans le process web, comme les autres relances, avec son verrou.

**Alternative écartée : renouvellement automatique sans fin.** Plus simple
pour le jeune, mais un jeune qui ne se connecte plus resterait « disponible »
indéfiniment et les seniors lui proposeraient des rencontres dans le vide.
La date de fin garde une information utile : le jeune est toujours là.

**Comptes existants.** Les jeunes qui ont enregistré leur planning avant ce
changement n'ont pas de modèle : l'onglet leur demande de le réenregistrer
une fois, et ils ne reçoivent pas de rappel tant que ce n'est pas fait.

## 2026-10-19 — Audit pré-production : heure des rencontres, achat via l'équipe

Audit navigateur des 5 rôles avant la mise en production (base locale).

**Heure saisie par l'admin et l'aidant.** L'admin est en métropole, les
utilisateurs en Guadeloupe. Les formulaires « Cadrage » (admin) et « Demander
une prestation » (aidant) envoyaient la valeur d'un champ `datetime-local`
sans fuseau ; le serveur la lisait dans son propre fuseau (UTC sur Render,
Paris en dev). Vérifié : saisie 15:00 depuis Paris → affichée 9h00.

*Décision* : ces deux formulaires sont supprimés. L'admin et l'aidant passent
par la page de la relation, qui affiche les créneaux du jeune et calcule
l'instant avec `gpDateTimeToUtc` (même chemin que le senior). Toute heure de
rencontre est une heure de Guadeloupe. En défense, le schéma serveur refuse
désormais une date sans fuseau (`Z` ou `±hh:mm`) au lieu de la deviner.

*Alternative écartée* : garder les champs libres avec conversion. L'heure
serait juste, mais une date tapée sans voir le planning du jeune était
souvent refusée « hors disponibilités » (règle volontaire, `validateSlot`
dans `server/routes.ts`).

**1ère rencontre : 30 min par défaut.** Le formulaire proposait 120 min,
ce qui transformait la rencontre gratuite en rencontre payante (refusée si
le senior n'a pas de crédit). `FREE_FIRST_MEETING_MAX_MINUTES` est passé
dans `shared/credits.ts` pour que client et serveur partagent la valeur.

**Achat sans prestataire de paiement.** Stripe est abandonné, HelloAsso
n'est pas encore branché : les boutons « Acheter » répondaient 503. Route
publique `GET /api/credits/payment-status` (`{ online }`) : sans prestataire,
les offres restent visibles et le bouton devient « écrivez à l'équipe » ;
l'admin enregistre le paiement (onglet Paiements, offre pré-remplie). Le
jour où HelloAsso est configuré, les boutons reviennent sans autre
changement.

**Déconnexion sur appareil partagé.** Senior et aidant partagent souvent une
tablette. La déconnexion vide maintenant le cache des requêtes et les
onglets mémorisés (`client/src/lib/logout.ts`) : le compte suivant héritait
de l'onglet du précédent (page vide) et voyait brièvement ses données.

**Non tranché, laissé tel quel** : le jeune ne peut ni refuser ni annuler
une rencontre (seuls senior et admin annulent). L'interface et l'e-mail lui
indiquent de prévenir l'équipe via le bouton Aide.

## 2026-10-14 — L'aidant ouvre son espace depuis le lien de validation

Décision d'Audrey : l'aidant doit pouvoir ouvrir son compte lui-même, sans
attendre l'admin.

**Comment.** La personne de confiance désignée par le senior à l'inscription
(`validatorEmail`) reçoit le lien de validation. Sur `/validate`, elle peut
« Valider et créer mon espace aidant » : `POST /api/validate` avec un champ
`aidant` (prénom, nom, mot de passe) active le senior ET crée un
`REFERENT_SENIOR` rattaché (`linkedSeniorId`), dans une seule transaction
(`storage.activateSeniorWithAidant`). « Valider seulement » reste possible.
`GET /api/validate/info` (lecture seule) fournit le prénom du senior et
l'adresse de connexion à afficher. La page d'inscription a un onglet
« Aidant » qui explique ces 3 étapes puis ouvre le formulaire senior.

**Pourquoi ce lien comme preuve.** Un compte aidant voit les rencontres et
paie pour un senior : il faut prouver le lien senior-aidant. Le lien e-mail
(token UUID à usage unique) prouve que la personne contrôle l'adresse choisie
par le senior. L'adresse du compte aidant est donc toujours
`validatorEmail`, jamais une valeur de la requête.

**Alternatives écartées.** Inscription libre de l'aidant + approbation du
rattachement (plus de code, demandes abusives à filtrer) ; l'aidant inscrit
les deux comptes (exige de rendre l'e-mail du senior facultatif, migration).

**Faux seniors (décision d'Audrey, 2026-10-15).** Rien ne vérifie qu'un
senior inscrit est réel : quelqu'un avec deux adresses e-mail peut inscrire un
faux senior, le valider et obtenir un espace aidant. Risque accepté : un faux
profil sera détecté à la première rencontre, qui est organisée et encadrée
par l'équipe. Pas de validation admin préalable ni de vérification de l'e-mail
du senior pour l'instant. Pas de nouveau risque par rapport à avant : le
validateur pouvait déjà valider un faux senior.

**Limites connues.** Un seul aidant par ce chemin (règle « 1 référent = 1
senior » inchangée) ; un 2e aidant, ou une adresse ayant déjà un compte,
passe encore par l'admin (`POST /api/admin/referents`). Le senior doit avoir
sa propre adresse e-mail, différente de celle de l'aidant. Tests :
`tests/validation-aidant.test.ts`.

## 2026-10-13 — Mot de passe oublié par lien e-mail

**Contexte.** Aucun parcours de réinitialisation n'existait : un sénior qui
oublie son mot de passe dépendait de l'admin. Bloquant pour le lancement.

**Choix.**
- Table `PasswordResetToken` séparée, pas de colonnes sur `User` : les routes
  qui renvoient un utilisateur retirent les champs sensibles un par un
  (`password`, `validationToken`…), une nouvelle colonne y aurait fuité.
- Seule l'empreinte SHA-256 du jeton est en base (jeton aléatoire 256 bits) :
  une fuite de la base ne donne aucun lien utilisable. bcrypt est inutile ici,
  le jeton n'est pas devinable comme un mot de passe.
- Lien valable 1 h, usage unique (consommation conditionnelle : deux
  soumissions simultanées, une seule passe), une nouvelle demande annule
  l'ancienne.
- Lien envoyé aux seuls comptes `ACTIVE` ; réponse identique dans tous les cas
  pour ne pas révéler quels e-mails sont inscrits.
- L'URL du lien vient de `BASE_URL` (`getBaseUrl` de `server/env.ts`), jamais
  des en-têtes de la requête : un en-tête `Host` falsifié enverrait sinon le
  jeton vers un site tiers (« reset poisoning »).
- Après réinitialisation, toutes les sessions du compte sont supprimées.

*Alternatives écartées* : mot de passe temporaire envoyé par e-mail (le mot de
passe circule en clair et reste valable) ; réinitialisation par l'admin seul
(charge manuelle, et l'admin connaîtrait le mot de passe).

**Non traité.** Les autres e-mails (relation acceptée, rencontre proposée…)
construisent encore leurs liens à partir des en-têtes de la requête
(`getBaseUrl(req)` dans `server/routes.ts`). Sans jeton secret, l'impact est
moindre, mais à aligner sur `BASE_URL`.

## 2026-10-13 — Un référent = un senior ; pas de recharge automatique ; plus d'abonnement

Décisions d'Audrey (revue de #16 et #17, ticket bobby#48).

**1 référent = 1 senior, pour l'instant.** Le modèle reste `User.linkedSeniorId`
(un seul senior par référent). `canBuyCredits(user)` vaut exactement
`creditOwnerId(user) !== null` (`shared/credits.ts`) : un référent sans senior
lié ne voit ni bouton ni phrase d'achat, et « Mes achats » lui dit de
contacter l'équipe. *Alternative écartée* : plusieurs seniors par référent
(table de liaison + choix du senior à l'achat) ; à revoir après le lancement
s'il y a de la demande.

**Pas de recharge automatique au lancement.** Une réservation refusée faute de
crédit (402 `INSUFFICIENT_CREDITS`, règle serveur inchangée) affiche « Vous
n'avez plus d'atelier disponible. » et, seulement à qui peut acheter, une
action « Acheter des ateliers » vers « Mes achats » ; au jeune : « Le senior
n'a plus d'atelier disponible. », sans achat (`insufficientCreditsNotice`).
*Alternative écartée* : recharge automatique (bobby#42, en attente).

**`subscriptionActive` n'est plus utilisé.** Lyannaj vend des crédits, pas un
abonnement : le champ n'est plus écrit (`createPayment`) ni affiché (admin). Il
reste en base. *Alternative écartée* : le supprimer maintenant — c'est une
migration, hors périmètre ; à faire dans une migration future réversible.

**« Mes achats » dans le menu.** Onglet du senior (`/mon-espace`) et du
référent (`/espace-referent`) qui ouvre la page existante `/mes-ateliers`
(pas de copie du contenu dans l'onglet : une seule page, un seul bouton
« Retour » vers l'espace d'origine).
Le 2026-10-13, l'onglet et le titre « Mes ateliers » ont été renommés
« Mes achats » à la demande d'Audrey (bobby#51) ; l'URL `/mes-ateliers` est
gardée pour ne casser aucun lien.

## 2026-10-13 — Forfaits nommés et page de vente `/forfaits`

**Décision.** `CreditOffer` gagne un champ `name` (Découverte, Essentiel,
Sérénité — provisoires). Trois offres : `pack-1` 18 €, `pack-5` 85 €,
`pack-10` 160 €. `shared/credit-offers.ts` reste la seule source : carte
d'achat, admin et page publique `/forfaits` lisent `CREDIT_OFFERS`.

**Raison.** Les id `pack-1` et `pack-5` sont conservés : le webhook relit
`metadata.offerId`, un id renommé ferait perdre les crédits d'un paiement en
cours. La page de vente ne décrit que des règles présentes dans le code
(`server/storage.ts`, `shared/credits.ts`) ; une règle ajoutée ou modifiée
côté serveur impose de relire `client/src/pages/forfaits.tsx`.

**Alternative écartée.** Prix et textes en base avec écran d'admin : inutile
tant que les prix changent rarement (un redéploiement suffit).

## 2026-10-12 — Relance des rencontres non clôturées : aux admins, une seule fois

**Contexte.** Les rencontres `PROPOSED`/`CONFIRMED` dont la date est passée
restaient bloquées (blocker #4). La première version de la relance écrivait
au sénior et au jeune « confirmez ou annulez », mais **seul un admin peut
marquer une rencontre réalisée** (`PATCH /api/interventions/:id/done` est
`requireAdmin`, et c'est elle qui débite le crédit) : les participants
recevaient une demande sans pouvoir y répondre.

**Décision — on relance les admins.** Pas de nouveau droit pour les
participants : laisser un sénior déclencher lui-même le débit de son crédit
est une décision métier sensible, non retenue. Une passe (toutes les 6h)
envoie à chaque admin actif **une** notification et **un** e-mail
récapitulatif (date, sénior, jeune), lien `/admin?tab=rencontres`.

**Décision — quand.** « En retard » = toujours `PROPOSED`/`CONFIRMED` **24h
après la fin** (début + durée), règle unique `shared/meeting-check.ts`
(`isMeetingOverdue`) utilisée par le job, le badge et le filtre « À traiter ».
Les boutons admin, eux, apparaissent dès la fin (`isMeetingEnded`) : le délai
de 24h ne concerne que la relance. Badge réservé aux admins.

**Décision — e-mails en une seule tentative.** Relance des rencontres : la
notification dans l'appli est la garantie (créée avec le marquage, dans une
transaction), l'e-mail est best effort. Rappel de feedback (e-mail seul) :
la rencontre est marquée dès qu'un destinataire a été servi ; si **tous**
les envois échouent (panne Brevo), personne n'a rien reçu et on retente à la
passe suivante, jusqu'à 7 jours après la rencontre (au-delà, abandon
journalisé : sinon une adresse définitivement invalide serait retentée sans
fin). Avant, un échec empêchait le marquage et le destinataire
servi recevait le même e-mail toutes les 6h, sans fin si l'autre adresse
était invalide.

**Processus côté équipe** : `docs/PROCESSUS-RENCONTRES.md`, à transmettre aux
administrateurs FEVES.

## 2026-10-12 — Crédits : réservation à la réservation, une seule rencontre gratuite

**Contexte.** Review avant mise en prod. Le contrôle à la création ne
vérifiait que `solde > 0` : avec 1 crédit, un senior pouvait prévoir 5
ateliers et finir à -4. La « première rencontre gratuite » était décidée par
le seul statut de la relation : deux rencontres courtes créées avant la
première validation passaient toutes deux sans contrôle. Enfin, deux
validations simultanées d'une même rencontre (double clic, deux admins)
débitaient deux crédits.

**Décision — les ateliers prévus réservent un crédit.** Crédits disponibles =
solde du `CreditLedger` − ateliers payants `PROPOSED`/`CONFIRMED`. Une
création exige au moins 1 crédit disponible. Le **débit reste à la
complétion** (règle du 2026-09-07 inchangée) ; annuler un atelier libère sa
réservation. Pas de nouvelle table : la réservation se déduit des rencontres
prévues, comme le solde se déduit du ledger. Le contrôle tourne dans la
transaction de création, sous un verrou advisory par senior
(`credits:<seniorId>`) : sans lui, des réservations simultanées sur des
jeunes différents consommaient le même dernier crédit (reproduit en test).

**Décision — une seule rencontre gratuite par relation, décidée à la
création et mémorisée.** Gratuite si la relation attend sa première
rencontre, si elle dure 30 min ou moins **et** s'il n'existe encore aucune
rencontre non annulée sur la relation (`isFreeMeeting`, `server/storage.ts`).
Le résultat est stocké dans `Intervention.isFree` (migration
`20261012120000_add_intervention_is_free`) : la réservation compte les
rencontres prévues non gratuites, le débit à la complétion lit le drapeau.
Recalculer à la complétion dépendait de l'ordre de clôture (une payante
clôturée avant la gratuite faisait passer la relation ACTIVE, et la gratuite
était débitée à son tour). Si la rencontre gratuite est annulée, le
drapeau passe à la plus ancienne rencontre courte encore prévue sur la
relation (`cancelIntervention`, même transaction), qui libère ainsi son
crédit réservé.

**Décision — clôture idempotente.** `completeIntervention` ne passe à
`COMPLETED_PENDING_FEEDBACK` que si la rencontre est encore `CONFIRMED`, et
`cancelIntervention` ne passe à `CANCELLED` que si elle est encore
`PROPOSED`/`CONFIRMED`, et `confirmIntervention` ne confirme qu'une rencontre
encore `PROPOSED` (mises à jour conditionnelles) ; sinon 409. Une rencontre
ne peut donc être ni débitée deux fois, ni annulée après débit, ni
reconfirmée après annulation.

**Conséquence.** Le solde négatif ne peut plus venir que d'un ajustement
admin après réservation ; l'alerte « Solde de crédits négatif » est conservée
pour ce cas.

## 2026-10-08 — NPS (recommandation du service) pour le financeur

**Contexte.** Le dossier SORTIR + (annexe 1) impose de systématiser le Net
Promoter Score : question « Recommanderiez-vous Lyannaj à votre entourage ? »
(0 à 10) + question qualitative « pourquoi cette note ? », puis lecture en
promoteurs / passifs / détracteurs. Rien n'existait : seule la note 1-5 étoiles
par rencontre (`Intervention.seniorRating`).

**Décision — table séparée `NpsResponse`, jamais de colonne sur
`Intervention`.** Le NPS mesure le service, pas une rencontre. Surtout : toute
colonne ajoutée à `Intervention` est sérialisée par les 3 routes à masquage de
feedback (`/api/meetings/history`, `/api/relations`, `/api/relations/:id`) et
fuirait vers le jeune si on oubliait de la masquer. Une table à part n'est lue
que par les routes NPS.

**Décision — qui répond, quand.** Seniors **et** référents (le référent paie
souvent pour le senior), jamais les jeunes (le NPS jeune mesure une autre
chose : la satisfaction du prestataire). Au plus une réponse par personne tous
les 90 jours (`NPS_COOLDOWN_DAYS`, évite la fatigue d'enquête), et seulement
après au moins une rencontre tenue (`COMPLETED` / `COMPLETED_PENDING_FEEDBACK`)
pour le senior concerné. Éligibilité décidée **côté serveur uniquement**
(`findNpsIneligibility`, `server/storage.ts`) ; le client ne fait que
masquer la carte. Création sous verrou advisory par utilisateur
(`pg_advisory_xact_lock`) : deux envois simultanés ne produisent qu'une ligne.

**Décision — seule la note brute est stockée.** Catégorie (0-6 détracteur,
7-8 passif, 9-10 promoteur) et score (`% promoteurs − % détracteurs`) sont
calculés par `shared/nps.ts`. Segments senior / référent affichés séparément :
deux populations différentes. Contraintes `CHECK` en base (note 0-10, rôle
senior/référent) car Prisma ne sait pas les exprimer et le chiffre part chez le
financeur.

**Décision — restitution : onglet admin + CSV pseudonymisé.** L'onglet
« Satisfaction » affiche le score avec **n** et un avertissement sous 30
réponses (un seul détracteur sur 10 réponses fait −10 points). Les noms y sont
visibles pour que l'équipe puisse rappeler un détracteur ; l'export CSV
(`;` + BOM pour Excel FR) n'en contient aucun — le financeur n'a pas à
identifier les personnes. Pas de rôle « financeur » (enum + gardes + tests de
permissions : trop pour un MVP).

**Compromis assumés.**
- Suppression d'un compte (décision du 2026-10-12) : la **note est conservée,
  anonyme** (`userId` passe à `NULL`, `onDelete: SetNull`) et le **motif libre
  est effacé** (`storage.deleteUser`, même transaction), car il peut identifier
  la personne. Ainsi un bilan déjà transmis au financeur reste reproductible.
  Une note seule, sans lien vers la personne ni texte, n'est plus une donnée
  personnelle. L'onglet admin affiche « Compte supprimé ».
- `GET /api/admin/nps` renvoie toutes les réponses de la période, sans
  pagination. Suffisant à l'échelle actuelle ; à revoir (GROUP BY + page) si
  les volumes grossissent.
- « Plus tard » est mémorisé en `localStorage` (par appareil, 14 jours) pour
  éviter une colonne `User` dans un MVP.
- Pas de rappel e-mail en V1 (déclencheur = carte sur le tableau de bord). À
  ajouter sur le modèle de `meeting-check-reminder.ts` si le taux de réponse
  est faible.
- Le texte du dossier collé s'arrêtait avant le détail des catégories de
  clients : les seuils sont ceux du NPS standard. À confirmer avec le texte
  complet du financeur.

## 2026-09-14 — Paiement en ligne des crédits via Stripe Checkout

**Contexte.** La décision du 2026-09-07 excluait Stripe du MVP (achat 100%
admin manuel). Revenu dessus : le parcours admin-only demandait un
aller-retour humain à chaque achat, non tenable au-delà de quelques seniors.

**Décision — provider abstrait, pas de couplage direct au SDK Stripe.**
`server/lib/payment-provider.ts` définit un contrat (`PaymentProvider`)
indépendant du prestataire ; `server/lib/stripe-provider.ts` l'implémente.
Routes et webhook n'importent jamais `stripe` directement — changer de
prestataire = nouvelle implémentation du contrat + changer l'export dans
`payment-provider.ts`.

**Décision — webhook idempotent, toujours 200 après signature valide.**
`POST /api/webhooks/payment` déduplique par `stripeSessionId` et renvoie 200
même en cas d'erreur métier post-validation, pour éviter que Stripe ne
retente indéfiniment un événement qu'on ne peut de toute façon pas traiter
différemment. Nécessite le body brut (`req.rawBody`, capturé dans
`server/app.ts`) pour la vérification de signature — jamais le body déjà
parsé en JSON.

**Le parcours admin manuel (`POST /api/admin/payments`) reste actif** en
parallèle, pour les cas où un aidant paie hors ligne.

**Non traité par ce changement** (voir `.agents/memory/blockers.md`) : le
solde crédit peut passer négatif si un admin valide deux interventions
`CONFIRMED` coup sur coup sur un solde à 1 — `completeIntervention` ne
revérifie pas le solde au moment du décompte, seule la création le bloque.

## 2026-09-07 — Crédits prépayés : 1 crédit = 1 atelier, décompte à la complétion

**Contexte.** La facturation était 100% manuelle et déclarative : un admin
saisit un `PaymentRecord` (montant + libellé) qui active juste un booléen
`subscriptionActive`, sans aucune notion de quantité ni de contrôle bloquant.
On passe à un modèle où le Senior (ou son aidant) achète un pack de N crédits,
1 crédit = 1 atelier consommé.

**Décision 1 — solde par Senior, historisé.** Le solde de crédits appartient
toujours au Senior, jamais à l'aidant/référent même quand c'est lui qui paie
(`linkedSeniorId` résolu côté route admin). Il est dérivé d'un historique
`CreditLedger` (achats, consommations, ajustements), pas d'un compteur brut,
pour rester justifiable en cas de litige aidant/senior.

**Décision 2 — décompte à la complétion, pas à la création.** Le crédit est
retiré au passage `CONFIRMED` → `COMPLETED_PENDING_FEEDBACK`
(`storage.completeIntervention`), le seul point de non-retour du cycle de vie
actuel (`CANCELLED` n'est plus possible après). Décrémenter plus tôt aurait
demandé une logique de remboursement en cas d'annulation.

**Décision 3 — première rencontre gratuite sous 30 minutes.** La toute
première rencontre d'une relation (`PENDING_FIRST_MEETING`) ne consomme pas de
crédit tant que sa durée prévue ne dépasse pas 30 minutes ; au-delà, elle est
traitée comme n'importe quelle rencontre suivante. Seule la durée **prévue** à
la création compte, jamais une durée réelle mesurée après coup.

**Décision 4 — blocage à la création, pas à la complétion.** Solde à 0 → 402
sur les trois chemins de création d'intervention, avec message et code
`INSUFFICIENT_CREDITS`. Un solde négatif au moment de la complétion (cas des
rencontres déjà engagées avant l'introduction du système) n'est pas bloqué :
il documente une dette plutôt que de figer une intervention déjà confirmée
sans porte de sortie.

**Pas de paiement en ligne.** L'achat reste un geste admin via le formulaire
`POST /api/admin/payments` existant, étendu d'un champ `credits` optionnel —
cohérent avec la cible (seniors peu digital-native, aidants souvent payeurs à
distance) et évite d'introduire Stripe/checkout pour ce MVP.

## 2026-08-13 — Historique des rencontres : endpoint unique et feedbacks cloisonnés

**Contexte.** Chaque rôle devait disposer d'un historique/récap des rencontres
(service, heures, personne rencontrée, date et heure, feedback). L'historique
existait déjà **quatre fois**, implémenté indépendamment dans `home.tsx`,
`teacher.tsx`, `referent.tsx` et `admin.tsx`, avec une couverture inégale :
seul l'admin avait l'export CSV, le référent n'affichait ni durée ni heure,
aucune vue ne montrait de total d'heures.

**Décision 1 — une seule source.** `GET /api/meetings/history` sert les cinq
rôles, avec `storage.getMeetingHistory(scope, filters)` côté données et
`client/src/components/meeting-history.tsx` côté rendu. Le périmètre dérive
**toujours** de `req.user` : `?userId=` est réservé à l'admin et au professeur
pour ses seuls élèves affiliés (403 sinon), et n'élargit jamais le périmètre.

**Décision 2 — visibilité des feedbacks au moindre privilège.** Jeune et sénior
ne voient que leur propre note et commentaire ; le référent voit celui de son
sénior affilié mais pas celui du jeune ; admin et professeur voient les deux.

Le masquage est fait **serveur, avant sérialisation** (`scopeFeedback` et
`scopeInterventionFeedback` dans `server/routes.ts`), pas par affichage
conditionnel : la réponse JSON ne doit pas transporter un commentaire que
l'appelant n'a pas le droit de lire.

Trois routes servent ces feedbacks et sont toutes filtrées :
`/api/meetings/history`, `/api/relations` et `/api/relations/:id`. Les deux
routes relations les renvoyaient en clair — ne filtrer que l'historique aurait
rendu la règle contournable en ouvrant la fiche relation. Conséquence assumée :
le sénior ne voit plus le commentaire du jeune sur la fiche relation, alors
qu'il le voyait avant.

**Notion de « service ».** C'est le champ `tasks` de l'intervention, soit les
ateliers de `shared/ateliers.ts`. Aucun champ `service` distinct n'a été
introduit : ce serait un doublon du modèle existant.

**Piège du récap.** `summary.byService` compte la durée entière d'une rencontre
pour *chacun* de ses ateliers. La somme par service dépasse donc légitimement
`totalMinutes` — ce sont des heures par service, pas une partition, d'où le
libellé « Heures par service ». Seuls les statuts `COMPLETED` et
`COMPLETED_PENDING_FEEDBACK` sont comptabilisés : une rencontre annulée ou
simplement proposée ne représente aucune heure passée.

**Pas de migration.** Les index existants (`Intervention @@index([relationId,
status])`, `Relation @@index([seniorId, status])` et `([juniorId, status])`)
couvrent ces accès.

## 2026-08-12 — Affichage des dates : heure Guadeloupe obligatoire

**Contexte.** Le développement se fait depuis la France métropolitaine
(Europe/Paris, avec changement d'heure), les utilisateurs sont en Guadeloupe
(UTC-4 fixe, sans changement d'heure), et le serveur Render tourne en UTC.
Trois fuseaux différents pour une même donnée.

**Problème.** L'heure des rencontres n'était pas affichée dans l'espace jeune.
L'ajouter avec `toLocaleTimeString` aurait rendu l'heure du navigateur : une
rencontre à 14h30 en Guadeloupe s'affichait 20h30 depuis Paris. Côté serveur
(notifications, e-mails), une rencontre à 21h heure Guadeloupe tombe le
lendemain 01h UTC — le mauvais **jour** était annoncé, pas seulement la
mauvaise heure.

**Décision.** `shared/dates.ts` est la source unique de formatage des dates
métier. Aucun appel `toLocaleDateString` / `toLocaleTimeString` sur
`scheduledDate`, `startAt` ou `endAt`, ni côté client ni côté serveur.

Helpers disponibles : `gpParts`, `fmtTime` ("14h30"), `fmtDayShort`,
`fmtDayLongMonth` ("mercredi 19 août"), `fmtDayLongMonthYear`,
`fmtDayNumeric` ("19/08/2026"), `gpDateTimeToUtc`. Le client y accède via
`client/src/lib/availability-format.ts` (simple ré-export).

**Le stockage n'était pas en cause** : les créneaux passent déjà par
`gpDateTimeToUtc`, `scheduledDate` est un instant UTC correct. Le correctif
portait uniquement sur l'affichage.

**Limite assumée.** L'offset UTC-4 est figé dans `GP_OFFSET_MS`. Ce code est
correct en Guadeloupe et faux partout où le DST s'applique. Toute extension
hors de l'archipel impose de passer à une implémentation à timezone
paramétrable (`Intl.DateTimeFormat` ou `date-fns-tz`).

**Hors périmètre.** Les dates purement administratives (`createdAt`,
`birthDate`, horodatage de la messagerie) restent en `toLocale*`. Même piège
si elles doivent un jour être exactes à l'heure près.
