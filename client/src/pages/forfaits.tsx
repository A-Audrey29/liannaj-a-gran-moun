import { Link, useLocation } from "wouter";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { teamContactHref, useCheckout, useOnlinePayment } from "@/components/credit-offers-card";
import { CREDIT_OFFERS } from "@shared/credit-offers";
import { canBuyCredits } from "@shared/credits";
import { CONTACT_EMAIL, ORGANIZATION_NAME, PLATFORM_NAME } from "@shared/branding";

/**
 * "Acheter des ateliers": explains how buying works, then lets the buyer pay.
 * Written for seniors: short sentences, large text (>= 18 px), large buttons.
 *
 * Every sentence describing a credit rule must match the code (reservation
 * and debit: server/storage.ts; cancellation: server/routes.ts; who may buy:
 * shared/credits.ts; payment redirect: useCheckout).
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
    text: "Le senior (ou l'équipe Lyannaj) peut annuler un atelier prévu. Son crédit vous est rendu : vous pourrez l'utiliser pour un autre atelier. Un atelier qui a déjà eu lieu ne peut plus être annulé.",
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

function RuleList({ rules }: { rules: Rule[] }) {
  return (
    <ul className="space-y-4">
      {rules.map((rule) => (
        <li key={rule.title} className="rounded-2xl bg-gray-50 border border-gray-200 p-5">
          <p className="font-bold text-gray-900">{rule.title}</p>
          <p className="text-gray-800">{rule.text}</p>
        </li>
      ))}
    </ul>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 rounded-2xl border-2 border-[#c9a4e8] bg-white p-5" data-testid={`step-achat-${n}`}>
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-white"
        aria-hidden="true"
      >
        {n}
      </span>
      <div>
        <p className="font-bold text-gray-900">
          <span className="sr-only">Étape {n} : </span>
          {title}
        </p>
        <p className="text-gray-800">{children}</p>
      </div>
    </li>
  );
}

export default function Forfaits() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const checkout = useCheckout();

  // Logged out: log in first. Senior or referent linked to a senior: buys
  // here. Any other account (junior, admin, teacher, referent without a linked
  // senior) cannot buy: no buy button and no sentence pointing to "Mes achats".
  const canBuy = !user || canBuyCredits(user);
  const online = useOnlinePayment();
  const homePath =
    user?.role === "REFERENT_SENIOR" ? "/espace-referent" : user?.role === "TEACHER" ? "/espace-professeur" : user?.role === "ADMIN" ? "/admin" : "/mon-espace";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 text-lg leading-relaxed text-foreground">
      {user && (
        <button
          onClick={() => setLocation(homePath)}
          className="mb-6 flex min-h-11 items-center gap-2 text-base text-muted-foreground transition-colors hover:text-foreground"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour à mon espace
        </button>
      )}

      <h1 className="text-3xl font-bold mb-4" data-testid="text-forfaits-title">
        Acheter des ateliers
      </h1>
      <p className="mb-2">Pour faire un atelier avec un jeune, vous utilisez des crédits.</p>
      <p className="mb-6 font-semibold">1 crédit = 1 atelier.</p>

      {canBuy && (
        <>
          <h2 className="text-2xl font-bold mb-4">Comment ça se passe ?</h2>
          <ol className="mb-10 space-y-3" data-testid="list-etapes-achat">
            <Step n={1} title="Vous choisissez un forfait">
              Un seul atelier, ou un pack pour en faire plusieurs. Le prix est affiché avant tout paiement.
            </Step>
            <Step n={2} title="Vous payez">
              {online === false ? (
                <span data-testid="text-forfaits-payment">
                  Le paiement en ligne n'est pas encore ouvert. Vous écrivez à l'équipe : elle vous indique comment régler.
                </span>
              ) : (
                <span data-testid="text-forfaits-payment">
                  Vous payez par carte bancaire. Vous êtes envoyé sur la page de paiement de notre prestataire : vos
                  coordonnées bancaires ne passent jamais par {PLATFORM_NAME}.
                </span>
              )}
            </Step>
            <Step n={3} title="Vos ateliers sont ajoutés">
              Vos crédits apparaissent dans « Mes achats ». Vous pouvez ensuite proposer une rencontre à un jeune.
            </Step>
          </ol>

          <div className="mb-8 rounded-2xl border-2 border-[#c9a4e8] bg-[#f3eaff] p-5" data-testid="box-forfaits-aidant">
            <p className="font-bold text-gray-900">Vous accompagnez un proche ?</p>
            <p className="text-gray-800">
              Vous pouvez acheter un forfait pour lui. Les crédits arrivent directement sur son compte. Vous suivez ses
              ateliers depuis votre espace aidant.
            </p>
          </div>

          <h2 className="text-2xl font-bold mb-4">Choisissez votre forfait</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
                  <p className="text-gray-700">soit {formatEuros(offer.priceEuros / offer.credits)} € l'atelier</p>
                )}
                {canBuy && !user && (
                  <Button
                    className="mt-auto h-14 text-lg"
                    onClick={() => setLocation("/login")}
                    data-testid={`button-forfait-${offer.id}`}
                  >
                    Me connecter pour acheter
                  </Button>
                )}
                {canBuy && user && online === true && (
                  <Button
                    className="mt-auto h-14 text-lg"
                    disabled={checkout.isPending}
                    onClick={() => checkout.mutate(offer.id)}
                    data-testid={`button-forfait-${offer.id}`}
                  >
                    {checkout.isPending && checkout.variables === offer.id ? "Redirection…" : "Acheter"}
                  </Button>
                )}
                {canBuy && user && online === false && (
                  <a
                    href={teamContactHref(user.role)}
                    className="mt-auto inline-flex h-14 items-center justify-center rounded-md border-2 border-primary px-4 text-lg font-semibold text-primary hover:bg-primary hover:text-white"
                    data-testid={`button-forfait-${offer.id}`}
                  >
                    Demander à l'équipe
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {!canBuy && (
        <p className="mb-10 font-semibold" data-testid="text-forfaits-not-buyer">
          Seuls les seniors et les référents liés à un senior achètent des forfaits.
        </p>
      )}
      {canBuy && (
        <>
          {canBuy && user && online === false && (
            <p className="mb-10 rounded-2xl bg-[#f3eaff] p-4" data-testid="text-buy-via-team">
              Le paiement en ligne n'est pas encore ouvert. Cliquez sur « Demander à l'équipe » : elle vous indique comment
              régler et ajoute vos ateliers à votre compte.
            </p>
          )}
          {canBuy && user && online !== false && <div className="mb-10" />}

          <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
            <ShieldCheck className="h-6 w-6 text-[#6d28d9]" aria-hidden="true" /> Acheter en confiance
          </h2>
          <ul className="mb-10 list-disc space-y-2 pl-6" data-testid="list-confiance-achat">
            <li>Sans abonnement : vous achetez seulement ce dont vous avez besoin.</li>
            <li>Le prix de chaque forfait est affiché avant de payer.</li>
            <li>La première rencontre avec chaque nouveau jeune est offerte (30 minutes ou moins).</li>
            <li>Un atelier annulé vous rend son crédit.</li>
            <li>
              {PLATFORM_NAME} est portée par l'association {ORGANIZATION_NAME} et financée par la CGRR Agirc-Arrco.
            </li>
            <li>
              Les détails sont dans les{" "}
              <Link href="/cgv" className="font-semibold text-primary underline" data-testid="link-forfaits-cgv">
                conditions de vente
              </Link>
              .
            </li>
          </ul>

        </>
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

      {canBuy && user && (
        <p className="mb-8" data-testid="text-forfaits-mes-ateliers">
          Vous voyez vos crédits à tout moment dans{" "}
          <Link href="/mes-ateliers" className="font-semibold text-primary underline">« Mes achats »</Link>.
        </p>
      )}

      <div className="mb-8 rounded-2xl bg-gray-50 border border-gray-200 p-5" data-testid="box-forfaits-help">
        <p className="font-bold text-gray-900">Une question avant d'acheter ?</p>
        <p className="text-gray-800">
          L'équipe {PLATFORM_NAME} vous répond :{" "}
          <a href={teamContactHref(user?.role)} className="font-semibold text-primary underline" data-testid="link-forfaits-help">
            {user && (user.role === "SENIOR" || user.role === "REFERENT_SENIOR") ? "écrire à l'équipe" : CONTACT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}
