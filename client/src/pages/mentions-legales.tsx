import { LegalPage, LegalSection, ARediger } from "@/components/legal-page";
import { PLATFORM_NAME, ORGANIZATION_NAME } from "@shared/branding";

export default function MentionsLegales() {
  return (
    <LegalPage title="Mentions légales">
      <LegalSection title="Éditeur du site">
        <p>
          La plateforme {PLATFORM_NAME} est éditée par l'association{" "}
          {ORGANIZATION_NAME}.
        </p>
        <ARediger>
          Dénomination sociale complète, forme juridique (association loi 1901),
          adresse du siège social, numéro RNA ou SIRET, numéro de téléphone et
          adresse e-mail de contact.
        </ARediger>
      </LegalSection>

      <LegalSection title="Directeur de la publication">
        <ARediger>
          Nom et qualité de la personne responsable de la publication
          (généralement le président de l'association).
        </ARediger>
      </LegalSection>

      <LegalSection title="Hébergement">
        <ARediger>
          Nom, adresse et numéro de téléphone de l'hébergeur. À renseigner une
          fois l'hébergement définitif choisi.
        </ARediger>
      </LegalSection>

      <LegalSection title="Propriété intellectuelle">
        <ARediger>
          Conditions de réutilisation des contenus du site (textes, images,
          marques).
        </ARediger>
      </LegalSection>

      <LegalSection title="Signaler un contenu">
        <ARediger>
          Adresse à laquelle signaler un contenu illicite, et délai de
          traitement.
        </ARediger>
      </LegalSection>
    </LegalPage>
  );
}
