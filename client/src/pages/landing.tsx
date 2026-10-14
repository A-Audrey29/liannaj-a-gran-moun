import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import seniorImg from "@assets/seniorF_1772976732165.png";
import jeuneImg from "@assets/jeuneF_1772976732187.png";
import mainsImg from "@assets/mainsConfiance_1772976732191.png";
import rireImg from "@assets/seniorJeuneHRire_1772976732193.png";
import cgrrLogo from "@assets/logo_CGRR_1774262532462.png";
import { User, GraduationCap, Heart, MessagesSquare, Mail } from "lucide-react";
import { CREDIT_OFFERS } from "@shared/credit-offers";
import { CONTACT_EMAIL } from "@shared/branding";

// Table of contents shown at the top of the page. Each id matches a section
// below; sections carry scroll-mt-20 so the sticky header (h-16) does not
// hide their title after the jump.
const SOMMAIRE: { id: string; label: string }[] = [
  { id: "confiance", label: "La confiance" },
  { id: "pour-qui", label: "Pour qui" },
  { id: "aidants", label: "Vous êtes aidant ?" },
  { id: "premiere-rencontre", label: "La première rencontre" },
  { id: "comment-ca-marche", label: "Comment ça marche" },
  { id: "tarifs", label: "Tarifs" },
];

function formatEuros(value: number): string {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

export default function Landing() {
  // A link such as "/#tarifs" opened from outside lands before React has
  // rendered the sections, so the browser finds no target: jump once mounted.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <div>
      <nav aria-label="Sommaire" className="bg-white border-b border-[#c9a4e8]/40" data-testid="nav-sommaire">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <p className="text-base font-semibold text-gray-700 mb-2">Sur cette page :</p>
          <ul className="flex flex-wrap gap-2">
            {SOMMAIRE.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="inline-flex items-center min-h-11 px-4 rounded-full bg-[#f3eaff] text-base font-medium text-[#dc4256] hover:bg-[#e8d7fe] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#dc4256]"
                  data-testid={`link-sommaire-${item.id}`}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <section className="bg-[#f3eaff] py-12 md:py-20">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl md:text-5xl font-bold text-[#dc4256] leading-tight mb-6" data-testid="text-hero-title">
              GRAN É JENN MOUN.
            </h1>
            <p className="text-gray-700 text-lg md:text-xl mb-8 max-w-lg">
              Une expérience d’entraide intergénérationnelle fondée sur la confiance, les liens tissés et la solidarité engagée.
            </p>
            <Link href="/register">
              <Button size="lg" className="rounded-full bg-[#dc4256] hover:bg-[#c73848] text-white px-8 text-base" data-testid="button-hero-register">
                CRÉER UN COMPTE
              </Button>
            </Link>
          </div>
          <div className="flex-1 flex justify-center">
            <div className="relative w-72 h-80 md:w-96 md:h-[26rem]">
              <div className="absolute -top-4 md:-top-6 right-0 w-48 h-48 md:w-64 md:h-64 rounded-full overflow-hidden z-10 shadow-lg">
                <img src={jeuneImg} alt="Jeune" className="w-full h-full object-cover" />
              </div>
              <div className="absolute bottom-0 left-0 w-52 h-52 md:w-72 md:h-72 rounded-2xl overflow-hidden shadow-lg">
                <img src={seniorImg} alt="Senior" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="confiance" className="scroll-mt-20 py-12 md:py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1">
            <div className="w-full max-w-sm mx-auto rounded-2xl overflow-hidden">
              <img src={mainsImg} alt="Confiance" className="w-full h-auto object-cover rounded-2xl" />
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl md:text-4xl font-bold text-[#dc4256] mb-4" data-testid="text-section-confiance">JAN OU KA RANJÉ KABANN AW SÉ JAN OU KA DÒMI</h2>
            <p className="text-lg text-gray-700 font-medium mb-4">
              Une confiance qui se construit et se partage
            </p>
            <div className="space-y-3 text-lg text-gray-700">
              <p>Chaque relation LYANNAJ repose sur un cadre clair, encadré par un enseignant référent garant des échanges.</p>
              <p>
                Les jeunes suivent une formation qui développe l'écoute, le respect et l'attention à la personne. Leur posture est
                adaptée au rythme de l'aîné — sans jamais se substituer à un service de soins.
              </p>
              <p>
                La relation est réciproque : le jeune apporte énergie et regard neuf, l'aîné transmet expérience et présence. Chacun
                contribue à la qualité du lien.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="pour-qui" className="scroll-mt-20 py-12 md:py-16 bg-[#f3eaff]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl md:text-4xl font-bold text-[#dc4256]" data-testid="text-section-pourqui">POUR QUI</h2>
            <Link href="/register">
              <Button variant="outline" className="rounded-full border-[#dc4256] text-[#dc4256] hover:bg-[#dc4256] hover:text-white" data-testid="button-pourqui-register">
                CRÉER UN COMPTE
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto mb-4 bg-[#e8d7fe] rounded-full flex items-center justify-center">
                <User className="w-8 h-8 text-[#8b5cf6]" />
              </div>
              <h3 className="text-xl font-bold mb-2">Senior</h3>
              <p className="text-lg text-gray-700">Partagez votre expérience et recevez un coup de main au quotidien.</p>
            </div>
            <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto mb-4 bg-[#e8d7fe] rounded-full flex items-center justify-center">
                <GraduationCap className="w-8 h-8 text-[#8b5cf6]" />
              </div>
              <h3 className="text-xl font-bold mb-2">Jeune</h3>
              <p className="text-lg text-gray-700">Apprenez, échangez et créez du lien avec vos aînés.</p>
            </div>
            <div
              id="aidants"
              className="scroll-mt-20 bg-white rounded-2xl p-6 text-center shadow-sm ring-2 ring-[#dc4256]/40"
              data-testid="card-landing-aidant"
            >
              <div className="w-16 h-16 mx-auto mb-4 bg-[#e8d7fe] rounded-full flex items-center justify-center">
                <Heart className="w-8 h-8 text-[#8b5cf6]" />
              </div>
              <h3 className="text-xl font-bold mb-2">Aidant</h3>
              <p className="text-lg text-gray-700">
                Vous accompagnez un proche ? Suivez ses rencontres, demandez un atelier pour lui, payez ses forfaits et
                écrivez à l'équipe.
              </p>
              <Link href="/register?profil=aidant">
                <Button
                  variant="outline"
                  className="mt-4 h-12 rounded-full border-[#dc4256] text-[#dc4256] text-base hover:bg-[#dc4256] hover:text-white"
                  data-testid="button-landing-aidant"
                >
                  Ouvrir mon espace aidant
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="premiere-rencontre" className="scroll-mt-20 py-12 md:py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row-reverse items-center gap-8">
          <div className="flex-1 flex justify-center">
            <div className="w-64 h-64 md:w-80 md:h-80 rounded-full overflow-hidden border-8 border-[#c9a4e8]">
              <img src={rireImg} alt="Rencontre" className="w-full h-full object-cover" />
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl md:text-4xl font-bold text-[#dc4256] mb-4" data-testid="text-section-rencontre">PRAN TI BAN LA SIZÉ</h2>
            <p className="text-lg text-gray-700 font-medium mb-4">
              Prenez place — la première rencontre, c'est nous qui l'organisons.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-lg text-gray-700">
              <li>Une première rencontre en présentiel, encadrée, dans un lieu neutre et sécurisant.</li>
              <li>Les rencontres suivantes sont programmées selon le rythme et les besoins de chacun.</li>
              <li>Pas de précipitation : le lien se construit à votre rythme, en toute tranquillité.</li>
              <li>Un référent présent à chaque étape, pour vous et pour votre famille.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-[#f3eaff]">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1 flex justify-center">
            <div className="w-64 h-64 md:w-72 md:h-72 rounded-full bg-white border-8 border-[#c9a4e8] flex items-center justify-center" aria-hidden="true">
              <MessagesSquare className="w-28 h-28 text-[#8b5cf6]" strokeWidth={1.5} />
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl md:text-4xl font-bold text-[#dc4256] mb-4" data-testid="text-section-discussion">PAWÒL KA FÈ CHIMEN</h2>
            <p className="text-lg text-gray-700 font-medium mb-4">
              Les mots font leur chemin — un espace pour échanger en confiance.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-lg text-gray-700">
              <li>Un espace personnel sur la plateforme, propre à chaque utilisateur.</li>
              <li>L'aîné est accompagné par un aidant familial ou une personne de confiance.</li>
              <li>Le jeune est suivi par son enseignant référent.</li>
              <li>Un tuteur-modérateur assure la supervision, en ligne et en présentiel.</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="comment-ca-marche" className="scroll-mt-20 py-12 md:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-4xl font-bold text-[#dc4256] mb-2" data-testid="text-section-comment">COMMENT ÇA MARCHE</h2>
          <p className="text-lg text-gray-700 mb-12">Quatre étapes simples pour créer un lien intergénérationnel durable.</p>

          <div className="space-y-6">
            {[
              { num: "1", text: "Inscrivez-vous comme senior ou comme jeune. Le senior indique un proche de confiance (son aidant), qui valide son inscription et peut ouvrir son espace aidant." },
              { num: "2", text: "FEVES analyse les profils et propose des mises en relation compatibles." },
              { num: "3", text: "Une première rencontre est organisée dans un lieu neutre et encadré." },
              { num: "4", text: "Si le courant passe, les rencontres deviennent autonomes." },
            ].map((step) => (
              <div key={step.num} className="flex items-center gap-6 text-left max-w-xl mx-auto">
                <div className="w-14 h-14 shrink-0 rounded-full bg-[#c9a4e8] text-white text-2xl font-bold flex items-center justify-center">
                  {step.num}
                </div>
                <p className="text-lg text-foreground">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="tarifs" className="scroll-mt-20 py-12 md:py-16 bg-[#f3eaff]">
        {/* Names and prices come from CREDIT_OFFERS only, never hard-coded. */}
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-2xl md:text-4xl font-bold text-[#dc4256] mb-2 text-center" data-testid="text-section-tarifs">TARIFS</h2>
          <p className="text-lg md:text-xl font-semibold text-foreground mb-8 text-center">1 crédit = 1 atelier avec un jeune</p>
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {CREDIT_OFFERS.map((offer) => (
              <li
                key={offer.id}
                className="bg-white rounded-2xl shadow-sm p-6 text-center"
                data-testid={`row-landing-tarif-${offer.id}`}
              >
                <p className="text-xl font-bold text-foreground">{offer.name}</p>
                <p className="text-lg text-gray-700">
                  {offer.credits} atelier{offer.credits > 1 ? "s" : ""}
                </p>
                <p className="text-4xl font-bold text-foreground my-2">{formatEuros(offer.priceEuros)} €</p>
                <p className="text-lg text-gray-700">
                  {offer.credits > 1 ? `soit ${formatEuros(offer.priceEuros / offer.credits)} € l'atelier` : "pour essayer"}
                </p>
              </li>
            ))}
          </ul>
          <ul className="max-w-md mx-auto space-y-2 text-lg text-foreground mb-8">
            <li>✓ Première rencontre offerte (30 minutes ou moins)</li>
            <li>✓ Sans abonnement</li>
            <li>✓ L'aidant peut payer pour son proche</li>
            <li>✓ Gratuit pour les jeunes</li>
          </ul>
          <div className="flex flex-col items-center gap-4">
            <Link href="/forfaits">
              <Button className="h-14 px-8 rounded-full bg-[#dc4256] hover:bg-[#c73848] text-white text-lg" data-testid="button-landing-forfaits">
                Voir le détail des forfaits
              </Button>
            </Link>
            <p className="text-lg text-gray-700 flex items-center gap-2" data-testid="text-landing-contact">
              <Mail className="w-5 h-5 shrink-0" aria-hidden="true" />
              Une question ?{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#dc4256] underline">
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
        </div>
      </section>

      <footer className="py-10 bg-white border-t border-[#c9a4e8]/30">
        <div className="max-w-4xl mx-auto px-4 flex flex-col items-center gap-4 text-center">
          <p className="text-base text-gray-700 font-medium">Cette plateforme est financée par :</p>
          <img
            src={cgrrLogo}
            alt="CGRR Agirc-Arrco — Retraite complémentaire"
            className="h-20 w-auto object-contain"
            data-testid="img-logo-financeur"
          />
        </div>
      </footer>
    </div>
  );
}
