import { LegalPage, LegalSection, ARediger } from "@/components/legal-page";
import { PLATFORM_NAME, ORGANIZATION_NAME } from "@shared/branding";

/**
 * Politique de confidentialité.
 *
 * La structure et l'inventaire des données ci-dessous sont dérivés du schéma
 * réel de la base (prisma/schema.prisma) : ils décrivent ce que la plateforme
 * collecte effectivement. Les durées de conservation, la base légale et les
 * coordonnées restent à faire valider juridiquement.
 *
 * Point d'attention : la plateforme traite des données de mineurs, ce qui
 * impose un consentement du titulaire de l'autorité parentale.
 */
export default function PolitiqueConfidentialite() {
  return (
    <LegalPage title="Politique de confidentialité">
      <LegalSection title="Responsable du traitement">
        <p>
          L'association {ORGANIZATION_NAME}, éditrice de la plateforme{" "}
          {PLATFORM_NAME}, est responsable du traitement des données décrites
          ci-dessous.
        </p>
        <ARediger>
          Coordonnées complètes du responsable de traitement et, le cas échéant,
          du délégué à la protection des données (DPO).
        </ARediger>
      </LegalSection>

      <LegalSection title="Données collectées">
        <p>Selon votre rôle sur la plateforme, nous collectons :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Identité et contact</strong> : nom, prénom, adresse e-mail,
            téléphone, date de naissance.
          </li>
          <li>
            <strong>Localisation</strong> : adresse postale, ville, code postal —
            utilisées pour proposer des mises en relation de proximité.
          </li>
          <li>
            <strong>Profil</strong> : photo de profil, présentation, ateliers
            d'intérêt, disponibilités déclarées.
          </li>
          <li>
            <strong>Pour les jeunes</strong> : établissement scolaire, ainsi que
            l'identité et l'adresse e-mail du référent légal et de la personne
            de confiance.
          </li>
          <li>
            <strong>Activité</strong> : rencontres planifiées, messages échangés
            avec votre binôme, appréciations laissées après une rencontre,
            signalements.
          </li>
        </ul>
        <p>
          Les photos de profil sont dépouillées de leurs métadonnées techniques
          (dont la géolocalisation) dès leur envoi.
        </p>
      </LegalSection>

      <LegalSection title="Finalités et base légale">
        <p>
          Ces données servent exclusivement à faire fonctionner la mise en
          relation : créer et sécuriser les comptes, proposer des binômes,
          organiser les rencontres, permettre l'échange de messages et assurer
          le suivi par l'encadrement.
        </p>
        <ARediger>
          Base légale retenue pour chaque finalité (exécution du service,
          consentement, intérêt légitime, obligation légale).
        </ARediger>
      </LegalSection>

      <LegalSection title="Données concernant les mineurs">
        <p>
          La plateforme met en relation des jeunes, susceptibles d'être mineurs,
          avec des personnes âgées. Leurs données font l'objet d'une attention
          particulière : l'inscription d'un jeune est validée par son référent,
          et les appréciations laissées après une rencontre ne sont jamais
          visibles de l'autre participant.
        </p>
        <ARediger>
          Modalités de recueil du consentement du titulaire de l'autorité
          parentale, âge minimal d'inscription, et procédure de vérification.
          Point à faire valider juridiquement en priorité.
        </ARediger>
      </LegalSection>

      <LegalSection title="Destinataires">
        <p>
          Les données ne sont ni vendues ni cédées à des tiers à des fins
          commerciales. Elles sont accessibles à l'équipe d'administration de
          l'association, ainsi qu'aux encadrants concernés (référent d'un
          sénior, professeur d'un jeune) dans la limite de leur périmètre.
        </p>
        <p>Nous faisons appel aux sous-traitants suivants :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Brevo</strong> — envoi des e-mails transactionnels
            (validation d'inscription, rappels).
          </li>
          <li>
            <strong>Hébergeur de la plateforme</strong> — hébergement de
            l'application et de la base de données.
          </li>
        </ul>
        <ARediger>
          Confirmer la liste des sous-traitants, leur localisation, et
          l'existence de garanties en cas de transfert hors Union européenne.
        </ARediger>
      </LegalSection>

      <LegalSection title="Durée de conservation">
        <ARediger>
          Durée de conservation pour chaque catégorie de données : compte actif,
          compte supprimé, messages, historique des rencontres, signalements.
        </ARediger>
      </LegalSection>

      <LegalSection title="Vos droits">
        <p>
          Vous disposez d'un droit d'accès, de rectification, d'effacement,
          d'opposition, de limitation du traitement et de portabilité de vos
          données. Pour les mineurs, ces droits sont exercés par le titulaire de
          l'autorité parentale.
        </p>
        <ARediger>
          Adresse (postale et e-mail) à laquelle adresser une demande, délai de
          réponse, et mention du droit de réclamation auprès de la CNIL.
        </ARediger>
      </LegalSection>

      <LegalSection title="Sécurité">
        <p>
          Les mots de passe sont stockés sous forme chiffrée et ne sont jamais
          lisibles, y compris par l'équipe technique. Les échanges avec la
          plateforme sont chiffrés, l'accès aux données est cloisonné par rôle,
          et les photos ne sont accessibles qu'aux personnes connectées.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          La plateforme dépose un unique cookie de session, strictement
          nécessaire au maintien de votre connexion. Aucun cookie publicitaire
          ni de mesure d'audience tierce n'est utilisé.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
