import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { teamContactHref, useOnlinePayment } from "@/components/credit-offers-card";
import { CREDIT_OFFERS } from "@shared/credit-offers";
import { canBuyCredits } from "@shared/credits";
import { CONTACT_EMAIL, ORGANIZATION_NAME, PLATFORM_NAME } from "@shared/branding";

/**
 * Public sales page for the credit offers, written for seniors: short
 * sentences, large text (>= 18 px), large buttons.
 *
 * Every sentence describing a credit rule must match the code (reservation
 * and debit: server/storage.ts; cancellation: server/routes.ts; who may buy:
 * shared/credits.ts).
 * Names and prices come from CREDIT_OFFERS only, never hard-coded here.
 */

function formatEuros(value: number): string {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

type Rule = { title: string; text: string };

// The three rules a buyer needs before paying. The others are folded under
// "En savoir plus" so the buy button stays near the top.
const MAIN_RULES: Rule[] = [
  {
    title: "Un atelier est prévu",
    text: "Un crédit est réservé pour cet atelier.",
  },
  {
    title: "L'atelier est annulé",
    text: "Vous (ou l'équipe Lyannaj) pouvez annuler un atelier prévu. Son crédit vous est rendu : vous pourrez l'utiliser pour un autre atelier. Un atelier qui a déjà eu lieu ne peut plus être annulé.",
  },
  {
    title: "La première rencontre est offerte",
    text: "Avec chaque nouveau jeune, votre toute première rencontre est offerte si elle dure 30 minutes ou moins. Plus longue, elle utilise un crédit, comme un autre atelier.",
  },
];

const MORE_RULES: Rule[] = [
  {
    title: "L'atelier a eu lieu",
    text: "Le crédit est retiré seulement après l'atelier, quand l'équipe a noté qu'il a bien eu lieu.",
  },
  {
    title: "Tous vos crédits sont réservés",
    text: "Un nouvel atelier ne peut pas être prévu. Seule exception : la première rencontre offerte. Sinon, il faut d'abord acheter un forfait.",
  },
];

/** Where "Une question ?" leads: the in-app help for buyers, e-mail otherwise. */
function RuleList({ rules }: { rules: Rule[] }) {
  return (
    <ol className="space-y-4">
      {rules.map((rule) => (
        <li key={rule.title} className="rounded-2xl bg-gray-50 border border-gray-200 p-5">
          <p className="font-bold text-gray-900">{rule.title}</p>
          <p className="text-gray-800">{rule.text}</p>
        </li>
      ))}
    </ol>
  );
}

export default function Forfaits() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Logged out: log in first. Senior or referent linked to a senior: the page
  // that holds the purchase card. Any other account (junior, admin, teacher,
  // referent without a linked senior) cannot buy: no buy button and no
  // sentence pointing to "Mes achats".
  const canBuy = !user || canBuyCredits(user);
  const online = useOnlinePayment();
  const buyPath = user ? "/mes-ateliers" : "/login";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 text-lg leading-relaxed text-foreground">
      <h1 className="text-3xl font-bold mb-4" data-testid="text-forfaits-title">
        Nos forfaits d'ateliers
      </h1>
      <p className="mb-2">
        Pour faire un atelier avec un jeune, vous utilisez des crédits.
      </p>
      <p className="mb-6 font-semibold">1 crédit = 1 atelier.</p>

      <div className="mb-8 rounded-2xl border-2 border-[#c9a4e8] bg-[#f3eaff] p-5" data-testid="box-forfaits-aidant">
        <p className="font-bold text-gray-900">Vous accompagnez un proche ?</p>
        <p className="text-gray-800">
          Vous pouvez acheter un forfait pour lui. Les crédits arrivent directement sur son compte. Vous suivez ses
          ateliers depuis votre espace aidant.
        </p>
      </div>

      <h2 className="text-2xl font-bold mb-4">Choisissez votre forfait</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        {CREDIT_OFFERS.map((offer) => (
          <div
            key={offer.id}
            className="rounded-2xl border-2 border-gray-300 bg-white p-6 flex flex-col gap-2"
            data-testid={`card-forfait-${offer.id}`}
          >
            <p className="text-2xl font-bold text-gray-900">{offer.name}</p>
            <p>
              {offer.credits} atelier{offer.credits > 1 ? "s" : ""}
            </p>
            <p className="text-3xl font-bold text-gray-900">{formatEuros(offer.priceEuros)} €</p>
            {offer.credits > 1 && (
              <p className="text-gray-700">
                soit {formatEuros(offer.priceEuros / offer.credits)} € l'atelier
              </p>
            )}
            {canBuy && (
              <Button
                className="mt-auto h-14 text-lg bg-[#c0354a] hover:bg-[#c53a4d] text-white"
                onClick={() => setLocation(buyPath)}
                data-testid={`button-forfait-${offer.id}`}
              >
                Acheter
              </Button>
            )}
          </div>
        ))}
      </div>
      {!canBuy && (
        <p className="mb-10 font-semibold" data-testid="text-forfaits-not-buyer">
          Seuls les seniors et les référents liés à un senior achètent des forfaits.
        </p>
      )}

      <h2 className="text-2xl font-bold mb-4">Comment vos crédits sont utilisés</h2>
      <div className="mb-4">
        <RuleList rules={MAIN_RULES} />
      </div>
      <details className="mb-10 group" data-testid="details-forfaits-more">
        <summary className="cursor-pointer inline-flex items-center min-h-12 px-5 rounded-full border-2 border-gray-300 font-semibold text-gray-900 hover:bg-gray-50">
          En savoir plus
        </summary>
        <div className="mt-4">
          <RuleList rules={MORE_RULES} />
        </div>
      </details>

      <h2 className="text-2xl font-bold mb-4">Payer</h2>
      <p className="mb-2" data-testid="text-forfaits-payment">
        {online === false
          ? "Le paiement en ligne n'est pas encore ouvert : écrivez à l'équipe, elle vous indique comment régler et ajoute vos ateliers à votre compte."
          : "Le paiement se fait en ligne, par carte bancaire."}
      </p>
      {canBuy && (
        <p className="mb-8" data-testid="text-forfaits-mes-ateliers">
          Vous voyez vos crédits à tout moment dans « Mes achats ».
        </p>
      )}

      <div className="mb-8 rounded-2xl bg-gray-50 border border-gray-200 p-5" data-testid="box-forfaits-help">
        <p className="font-bold text-gray-900">Une question avant d'acheter ?</p>
        <p className="text-gray-800 mb-2">
          L'équipe {PLATFORM_NAME} vous répond :{" "}
          <a href={teamContactHref(user?.role)} className="font-semibold text-[#c0354a] underline" data-testid="link-forfaits-help">
            {user && (user.role === "SENIOR" || user.role === "REFERENT_SENIOR") ? "écrire à l'équipe" : CONTACT_EMAIL}
          </a>
        </p>
        <p className="text-gray-700">
          {PLATFORM_NAME} est portée par l'association {ORGANIZATION_NAME} et financée par la CGRR Agirc-Arrco.
        </p>
      </div>

      {canBuy && (
        <Button
          className="w-full md:w-auto h-14 px-8 text-lg bg-[#c0354a] hover:bg-[#c53a4d] text-white"
          onClick={() => setLocation(buyPath)}
          data-testid="button-forfaits-buy"
        >
          {user ? "Acheter un forfait" : "Me connecter pour acheter"}
        </Button>
      )}
    </div>
  );
}
