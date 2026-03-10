# Configuration Brevo (Sendinblue) — FEVES

## Prérequis
- Un compte Brevo (https://www.brevo.com)
- Un nom de domaine vérifié pour l'envoi d'emails

## Étape 1 : Créer un compte Brevo
1. Aller sur https://www.brevo.com et créer un compte
2. Compléter la vérification d'identité

## Étape 2 : Récupérer la clé API
1. Se connecter à Brevo
2. Aller dans **Paramètres** (icône engrenage) → **SMTP & API** → **Clés API**
3. Cliquer sur **Générer une nouvelle clé API**
4. Copier la clé (elle ne sera affichée qu'une seule fois)

## Étape 3 : Vérifier le domaine d'expédition
1. Aller dans **Paramètres** → **Expéditeurs, Domaines & IPs dédiées**
2. Ajouter votre domaine (ex: `feves.fr`)
3. Suivre les instructions pour ajouter les enregistrements DNS :
   - **SPF** : Enregistrement TXT
   - **DKIM** : Enregistrement TXT
   - **DMARC** : Enregistrement TXT (recommandé)
4. Vérifier que le domaine est bien validé (coche verte)

## Étape 4 : Variables d'environnement

Ajouter ces variables dans votre environnement (Replit Secrets ou Render Environment) :

| Variable | Obligatoire | Valeur par défaut | Description |
|---|---|---|---|
| `BREVO_API_KEY` | **Oui** | — | Clé API v3 récupérée à l'étape 2 |
| `BREVO_SENDER_EMAIL` | Non | `noreply@feves.fr` | Adresse email d'expédition (doit être sur un domaine vérifié) |
| `BREVO_SENDER_NAME` | Non | `FEVES` | Nom affiché dans l'email |

### Sur Render
1. Aller dans votre service → **Environment**
2. Ajouter les variables ci-dessus
3. Redéployer le service

### Sur Replit
1. Aller dans **Secrets** (icône cadenas)
2. Ajouter `BREVO_API_KEY` avec votre clé

## Emails envoyés par la plateforme

| Email | Destinataire | Déclencheur |
|---|---|---|
| Validation d'inscription | Référent / Personne de confiance | Inscription d'un utilisateur |
| Relation acceptée | Senior | Un jeune accepte la demande de relation |
| Intervention proposée | Jeune | Un senior propose une intervention |
| Intervention confirmée | Senior | Un jeune confirme l'intervention |
| Rappel de feedback | Senior + Jeune | 3 jours après une intervention sans feedback |
| Notification nouvel admin | — | Création d'un compte admin |

## Comportement sans clé API

Si `BREVO_API_KEY` n'est pas configurée, les emails ne sont **pas envoyés** et un message de log est affiché :
```
[BREVO] BREVO_API_KEY non configurée - email non envoyé: { to: '...', subject: '...' }
```
L'application continue de fonctionner normalement, seuls les emails sont désactivés.

## Limites du plan gratuit Brevo
- **300 emails/jour** sur le plan gratuit
- Suffisant pour une phase de lancement
- Plans payants disponibles si le volume augmente

## Notes pour Render
- Les variables d'environnement sont configurées dans le dashboard Render
- Le domaine d'expédition doit être vérifié **dans Brevo**, pas dans Render
- Assurez-vous que `BASE_URL` est également configuré dans Render pour que les liens dans les emails pointent vers le bon domaine
