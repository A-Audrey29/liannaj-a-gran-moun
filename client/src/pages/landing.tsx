import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import seniorImg from "@assets/seniorF_1772976732165.png";
import jeuneImg from "@assets/jeuneF_1772976732187.png";
import mainsImg from "@assets/mainsConfiance_1772976732191.png";
import rireImg from "@assets/seniorJeuneHRire_1772976732193.png";
import { User, GraduationCap, Heart } from "lucide-react";

export default function Landing() {
  return (
    <div>
      <section className="bg-[#f3eaff] py-12 md:py-20">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl md:text-5xl font-bold text-[#dc4256] leading-tight mb-6" data-testid="text-hero-title">
              DES RENCONTRES EN TOUTE CONFIANCE.
            </h1>
            <p className="text-muted-foreground text-base md:text-lg mb-8 max-w-lg">
              Lorem ipsum dolor sit amet. Cum ducimus opta sed quo nihil est praesentium galisum qui fugit aperiam et exercitationem quas est accusamus.
            </p>
            <Link href="/register">
              <Button size="lg" className="rounded-full bg-[#dc4256] hover:bg-[#c73848] text-white px-8 text-base" data-testid="button-hero-register">
                CREER UN COMPTE
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

      <section className="py-12 md:py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1">
            <div className="w-full max-w-sm mx-auto rounded-2xl overflow-hidden">
              <img src={mainsImg} alt="Confiance" className="w-full h-auto object-cover rounded-2xl" />
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl md:text-4xl font-bold text-[#dc4256] mb-4" data-testid="text-section-confiance">CONFIANCE</h2>
            <p className="text-muted-foreground mb-4">
              Lorem ipsum dolor sit amet. Cum ducimus opta sed quo nihil est praesentium galisum qui fugit aperiam et accusamus.
            </p>
            <p className="text-muted-foreground">
              Lorem ipsum dolor sit amet. Cum ducimus opta sed quo nihil est praesentium galisum qui fugit aperiam et exercitationem.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-[#f3eaff]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl md:text-4xl font-bold text-[#dc4256]" data-testid="text-section-pourqui">POUR QUI</h2>
            <Link href="/register">
              <Button variant="outline" className="rounded-full border-[#dc4256] text-[#dc4256] hover:bg-[#dc4256] hover:text-white" data-testid="button-pourqui-register">
                CREER UN COMPTE
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto mb-4 bg-[#e8d7fe] rounded-full flex items-center justify-center">
                <User className="w-8 h-8 text-[#8b5cf6]" />
              </div>
              <h3 className="text-xl font-bold mb-2">Senior</h3>
              <p className="text-sm text-muted-foreground">Partagez votre experience et recevez un coup de main du quotidien.</p>
            </div>
            <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto mb-4 bg-[#e8d7fe] rounded-full flex items-center justify-center">
                <GraduationCap className="w-8 h-8 text-[#8b5cf6]" />
              </div>
              <h3 className="text-xl font-bold mb-2">Jeune</h3>
              <p className="text-sm text-muted-foreground">Apprenez, echangez et creez du lien avec vos aines.</p>
            </div>
            <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto mb-4 bg-[#e8d7fe] rounded-full flex items-center justify-center">
                <Heart className="w-8 h-8 text-[#8b5cf6]" />
              </div>
              <h3 className="text-xl font-bold mb-2">Aidant</h3>
              <p className="text-sm text-muted-foreground">Trouvez du soutien et des moments de repit pres de chez vous.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row-reverse items-center gap-8">
          <div className="flex-1 flex justify-center">
            <div className="w-64 h-64 md:w-80 md:h-80 rounded-full overflow-hidden border-8 border-[#c9a4e8]">
              <img src={rireImg} alt="Rencontre" className="w-full h-full object-cover" />
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl md:text-4xl font-bold text-[#dc4256] mb-4" data-testid="text-section-rencontre">RENCONTRE</h2>
            <p className="text-muted-foreground">
              Lorem ipsum dolor sit amet. Cum ducimus opta sed quo nihil est praesentium galisum qui fugit aperiam et exercitationem quas est accusamus.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16 bg-[#f3eaff]">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1 flex justify-center">
            <div className="w-64 h-64 md:w-72 md:h-72 rounded-2xl overflow-hidden bg-gray-200 flex items-center justify-center">
              <span className="text-muted-foreground text-sm">Photo a venir</span>
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl md:text-4xl font-bold text-[#dc4256] mb-4" data-testid="text-section-discussion">DISCUSSION</h2>
            <p className="text-muted-foreground">
              Lorem ipsum dolor sit amet. Cum ducimus opta sed quo nihil est praesentium galisum qui fugit aperiam et exercitationem quas est accusamus.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-4xl font-bold text-[#dc4256] mb-2" data-testid="text-section-comment">COMMENT CA MARCHE</h2>
          <p className="text-muted-foreground mb-12">Quatre etapes simples pour creer un lien intergenerationnel durable.</p>

          <div className="space-y-6">
            {[
              { num: "1", text: "Inscrivez-vous en tant que senior ou jeune." },
              { num: "2", text: "FEVES analyse les profils et propose des mises en relation compatibles." },
              { num: "3", text: "Une premiere rencontre est organisee dans un lieu neutre et encadre." },
              { num: "4", text: "Si le courant passe, les rencontres deviennent autonomes." },
            ].map((step) => (
              <div key={step.num} className="flex items-center gap-6 text-left max-w-xl mx-auto">
                <div className="w-14 h-14 shrink-0 rounded-full bg-[#c9a4e8] text-white text-2xl font-bold flex items-center justify-center">
                  {step.num}
                </div>
                <p className="text-base text-foreground">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
