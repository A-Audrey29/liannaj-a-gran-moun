import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { CREDIT_OFFERS } from "@shared/credit-offers";
import { canBuyCredits } from "@shared/credits";

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

const RULES: { title: string; text: string }[] = [
  {
    title: "Un atelier est prévu",
    text: "Un crédit est mis de côté pour cet atelier.",
  },
  {
    title: "Plus de crédit libre",
    text: "Si tous vos crédits sont déjà mis de côté, un nouvel atelier ne peut pas être prévu. Seule exception : la première rencontre offerte (voir plus bas). Sinon, il faut d'abord acheter un forfait.",
  },
  {
    title: "L'atelier a eu lieu",
    text: "Le crédit est retiré seulement après l'atelier, quand l'équipe a noté qu'il a bien eu lieu.",
  },
  {
    title: "L'atelier est annulé",
    text: "Vous (ou l'équipe Lyannaj) pouvez annuler un atelier prévu. Son crédit redevient libre. Vous pourrez l'utiliser pour un autre atelier. Un atelier qui a déjà eu lieu ne peut plus être annulé.",
  },
  {
    title: "La première rencontre est offerte",
    text: "Avec chaque nouveau jeune, votre toute première rencontre est offerte si elle dure 30 minutes ou moins. Plus longue, elle utilise un crédit, comme un autre atelier.",
  },
  {
    title: "Votre référent peut payer pour vous",
    text: "Un référent lié à votre compte peut acheter un forfait pour vous. Les crédits arrivent sur votre compte.",
  },
];

export default function Forfaits() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Logged out: log in first. Senior or referent: the page that holds the
  // purchase card. Any other account cannot buy: no buy button at all
  // (/mes-ateliers would only say "Page non disponible").
  const canBuy = !user || canBuyCredits(user.role);
  const buyPath = user ? "/mes-ateliers" : "/login";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 text-lg leading-relaxed text-foreground">
      <h1 className="text-3xl font-bold mb-4" data-testid="text-forfaits-title">
        Nos forfaits d'ateliers
      </h1>
      <p className="mb-2">
        Pour faire un atelier avec un jeune, vous utilisez des crédits.
      </p>
      <p className="mb-8 font-semibold">1 crédit = 1 atelier.</p>

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
                className="mt-auto h-14 text-lg bg-[#dc4256] hover:bg-[#c53a4d] text-white"
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
          Seuls les seniors et leurs référents achètent des forfaits.
        </p>
      )}

      <h2 className="text-2xl font-bold mb-4">Comment vos crédits sont utilisés</h2>
      <ol className="space-y-4 mb-10">
        {RULES.map((rule) => (
          <li key={rule.title} className="rounded-2xl bg-gray-50 border border-gray-200 p-5">
            <p className="font-bold text-gray-900">{rule.title}</p>
            <p className="text-gray-800">{rule.text}</p>
          </li>
        ))}
      </ol>

      <h2 className="text-2xl font-bold mb-4">Payer</h2>
      <p className="mb-2">Le paiement se fait en ligne, par carte bancaire.</p>
      <p className="mb-8">
        Vous voyez vos crédits à tout moment dans la page « Mes ateliers ».
      </p>

      {canBuy && (
        <Button
          className="w-full md:w-auto h-14 px-8 text-lg bg-[#dc4256] hover:bg-[#c53a4d] text-white"
          onClick={() => setLocation(buyPath)}
          data-testid="button-forfaits-buy"
        >
          {user ? "Acheter un forfait" : "Me connecter pour acheter"}
        </Button>
      )}
    </div>
  );
}
