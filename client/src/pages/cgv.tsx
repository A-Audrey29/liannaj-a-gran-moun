import { LegalPage, LegalSection, ARediger } from "@/components/legal-page";

/**
 * Conditions générales de vente : achat de crédits d'ateliers.
 *
 * Page volontairement vierge : le contenu juridique est rédigé par
 * l'association, pas dans le code. Chaque bloc indique ce qui est attendu.
 */
export default function CGV() {
  return (
    <LegalPage title="Conditions générales de vente">
      <LegalSection title="Objet">
        <ARediger>
          Objet des présentes conditions : vente de crédits donnant accès aux
          ateliers de la plateforme, et identification du vendeur (association,
          adresse, contact).
        </ARediger>
      </LegalSection>

      <LegalSection title="Offres et prix">
        <ARediger>
          Description des offres de crédits, prix TTC (ou mention de
          non-assujettissement à la TVA), et ce que comprend un crédit.
        </ARediger>
      </LegalSection>

      <LegalSection title="Commande et paiement">
        <ARediger>
          Étapes de la commande, moyens de paiement acceptés, prestataire de
          paiement utilisé, et moment où la commande est considérée comme
          définitive.
        </ARediger>
      </LegalSection>

      <LegalSection title="Utilisation des crédits">
        <ARediger>
          Moment où un crédit est consommé, durée de validité des crédits, et
          sort des crédits non utilisés.
        </ARediger>
      </LegalSection>

      <LegalSection title="Annulation et remboursement">
        <ARediger>
          Conditions d'annulation d'un atelier, effet sur les crédits, et
          conditions de remboursement.
        </ARediger>
      </LegalSection>

      <LegalSection title="Droit de rétractation">
        <ARediger>
          Délai et modalités d'exercice du droit de rétractation, ou motif
          d'exception le cas échéant.
        </ARediger>
      </LegalSection>

      <LegalSection title="Réclamations et médiation">
        <ARediger>
          Adresse de contact pour les réclamations, et coordonnées du médiateur
          de la consommation.
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
