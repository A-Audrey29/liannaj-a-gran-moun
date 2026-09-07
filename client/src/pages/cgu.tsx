import { LegalPage, LegalSection, ARediger } from "@/components/legal-page";
import { PLATFORM_NAME } from "@shared/branding";

export default function CGU() {
  return (
    <LegalPage title="Conditions générales d'utilisation">
      <LegalSection title="Objet">
        <p>
          Les présentes conditions régissent l'utilisation de la plateforme{" "}
          {PLATFORM_NAME}, qui met en relation des personnes âgées et des jeunes
          en Guadeloupe autour d'activités partagées.
        </p>
      </LegalSection>

      <LegalSection title="Accès à la plateforme">
        <p>
          L'inscription est gratuite. Chaque compte est soumis à une validation
          préalable par un référent avant de pouvoir être utilisé.
        </p>
        <ARediger>
          Conditions d'âge, pièces éventuellement demandées, et motifs de refus
          d'inscription.
        </ARediger>
      </LegalSection>

      <LegalSection title="Engagements des utilisateurs">
        <p>Chaque utilisateur s'engage à :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>fournir des informations exactes lors de son inscription ;</li>
          <li>ne pas usurper l'identité d'un tiers ;</li>
          <li>adopter un comportement respectueux envers les autres membres ;</li>
          <li>ne pas utiliser la plateforme à des fins commerciales ;</li>
          <li>signaler tout comportement inapproprié.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Rencontres entre membres">
        <ARediger>
          Cadre des rencontres organisées via la plateforme : rôle et
          responsabilité de l'association, encadrement, assurance, et consignes
          de sécurité — en particulier lorsqu'un mineur est concerné.
        </ARediger>
      </LegalSection>

      <LegalSection title="Signalement et modération">
        <p>
          Tout membre peut signaler un contenu ou un comportement depuis la
          plateforme. Les signalements sont traités par l'équipe
          d'administration.
        </p>
        <ARediger>
          Délai de traitement, sanctions applicables (avertissement, suspension,
          bannissement) et voies de recours.
        </ARediger>
      </LegalSection>

      <LegalSection title="Suspension et suppression de compte">
        <p>
          Un compte peut être suspendu ou supprimé en cas de manquement aux
          présentes conditions. Chaque membre peut demander la suppression de
          son compte à tout moment.
        </p>
        <ARediger>
          Procédure de suppression, conséquences sur les données et l'historique
          des rencontres.
        </ARediger>
      </LegalSection>

      <LegalSection title="Responsabilité">
        <ARediger>
          Limites de responsabilité de l'association quant au contenu publié par
          les membres et au déroulement des rencontres.
        </ARediger>
      </LegalSection>

      <LegalSection title="Modification des conditions">
        <ARediger>
          Modalités d'information des membres en cas d'évolution des présentes
          conditions.
        </ARediger>
      </LegalSection>

      <LegalSection title="Droit applicable">
        <ARediger>
          Droit applicable et juridiction compétente en cas de litige.
        </ARediger>
      </LegalSection>
    </LegalPage>
  );
}
