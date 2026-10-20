/**
 * Garde-fous d'accessibilite et de responsive (audit mobile du 2026-10-20).
 *
 * Ce sont des controles statiques (pas de navigateur) : ils lisent le code et
 * echouent si l'un des defauts trouves a l'audit revient. Un controle visuel
 * complet (axe + Playwright, 320/375/414 px) reste a faire a la main avant une
 * mise en production.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

function walk(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    return e.isDirectory() ? walk(rel) : rel.endsWith(".tsx") ? [rel] : [];
  });
}
const tsxFiles = walk("client/src");

// WCAG 2.x relative luminance / contrast ratio.
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function hslToHex(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

describe("zoom et viewport", () => {
  it("n'interdit pas le zoom (WCAG 1.4.4)", () => {
    const html = read("client/index.html");
    const viewport = html.match(/<meta name="viewport"[^>]*>/)?.[0] ?? "";
    expect(viewport).toContain("width=device-width");
    expect(viewport).not.toMatch(/maximum-scale/);
    expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)/);
  });

  it("ne bloque pas l'orientation de la PWA", () => {
    const manifest = JSON.parse(read("client/public/manifest.json"));
    expect(manifest.orientation).not.toMatch(/portrait|landscape/);
  });
});

describe("contraste des couleurs de marque (AA = 4.5)", () => {
  it("la couleur primaire du theme passe sur blanc et sur le fond lavande", () => {
    const css = read("client/src/index.css");
    const m = css.match(/:root\s*\{[\s\S]*?--primary:\s*(\d+)\s+(\d+)%\s+(\d+)%/);
    expect(m).not.toBeNull();
    const primary = hslToHex(Number(m![1]), Number(m![2]), Number(m![3]));
    expect(contrast(primary, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(primary, "#f3eaff")).toBeGreaterThanOrEqual(4.5);
  });

  it("pas de texte blanc semi-transparent (contraste insuffisant sur le rouge de marque)", () => {
    const offenders = tsxFiles.filter((f) => /text-white\/[1-8]0\b/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("n'utilise plus l'ancien rouge #dc4256 ni le violet #8b5cf6 en texte", () => {
    const offenders = tsxFiles.filter((f) => /#dc4256|text-\[#8b5cf6\]/i.test(read(f)));
    expect(offenders).toEqual([]);
  });
});

describe("tailles de texte et images", () => {
  it("aucun texte sous 12 px", () => {
    const offenders = tsxFiles.filter((f) => /text-\[(9|10|11)px\]/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("chaque <img> declare un attribut alt", () => {
    const offenders: string[] = [];
    for (const f of tsxFiles) {
      for (const tag of read(f).match(/<img\b[\s\S]*?\/>/g) ?? []) {
        if (!/\balt=/.test(tag)) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("les photos de profil passent par UserAvatar (repli sur les initiales)", () => {
    const offenders = tsxFiles.filter((f) =>
      /<img[^>]*(profilePhoto|photoUrl|getPhotoUrl)/.test(read(f).replace(/\s+/g, " ")),
    );
    expect(offenders).toEqual([]);
  });

  it("la landing n'embarque plus de PNG de plusieurs centaines de Ko", () => {
    const landing = read("client/src/pages/landing.tsx");
    const imports = [...landing.matchAll(/from "@assets\/([^"]+)"/g)].map((m) => m[1]);
    for (const file of imports) {
      const size = fs.statSync(path.join(ROOT, "attached_assets", file)).size;
      expect(size, `${file} pese ${Math.round(size / 1024)} Ko`).toBeLessThan(150 * 1024);
    }
  });
});

describe("composants de base", () => {
  it("les dialogues defilent quand l'ecran est trop court", () => {
    for (const f of ["client/src/components/ui/dialog.tsx", "client/src/components/ui/alert-dialog.tsx"]) {
      const src = read(f);
      expect(src, f).toMatch(/max-h-\[calc\(100dvh-2rem\)\]/);
      expect(src, f).toContain("overflow-y-auto");
    }
  });

  it("les libelles des boutons de fermeture sont en francais", () => {
    expect(read("client/src/components/ui/dialog.tsx")).not.toContain(">Close<");
    expect(read("client/src/components/ui/sheet.tsx")).not.toContain(">Close<");
  });

  it("les cibles tactiles font 44 px sur mobile", () => {
    const button = read("client/src/components/ui/button.tsx");
    expect(button).toContain("min-h-11");
    expect(button).toMatch(/icon: "h-11 w-11/);
    expect(read("client/src/components/ui/input.tsx")).toContain("h-11");
  });

  it("le badge ne force pas la page a deborder pour les ateliers a nom long", () => {
    const home = read("client/src/pages/home.tsx");
    expect(home).toMatch(/className="[^"]*whitespace-normal[^"]*"\s+data-testid=\{`badge-category-/);
  });

  it("un badge positionne en absolute n'est pas ecrase par hover-elevate", () => {
    const offenders: string[] = [];
    for (const f of tsxFiles) {
      for (const tag of read(f).match(/<Badge\b[^>]*className="[^"]*\babsolute\b[^"]*"/g) ?? []) {
        if (!tag.includes("no-default-hover-elevate")) offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("navigation et formulaires", () => {
  it("le layout propose un lien d'evitement vers le contenu", () => {
    const layout = read("client/src/components/app-layout.tsx");
    expect(layout).toContain('href="#main-content"');
    expect(layout).toContain('id="main-content"');
  });

  it("les pages d'authentification ont un titre h1", () => {
    for (const f of ["login", "register", "forgot-password", "reset-password", "registration-pending"]) {
      expect(read(`client/src/pages/${f}.tsx`), f).toMatch(/<CardTitle as="h1"/);
    }
  });

  it("les boutons-icones sans texte ont un nom accessible", () => {
    expect(read("client/src/components/messages-tab.tsx")).toContain('aria-label="Envoyer le message"');
    expect(read("client/src/components/disponibilites-tab.tsx")).toContain('aria-label="Supprimer ce créneau"');
    const home = read("client/src/pages/home.tsx");
    expect(home).toContain('aria-label="Changer la photo de profil"');
    expect(home).toContain('aria-label="Supprimer la photo de profil"');
  });

  it("l'animation respecte prefers-reduced-motion", () => {
    expect(read("client/src/index.css")).toContain("prefers-reduced-motion: reduce");
    expect(read("client/src/App.tsx")).toContain('reducedMotion="user"');
  });
});
