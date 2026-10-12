export const ATELIERS = [
  "Ateliers de bien être : coiffure, beauté des mains et des pieds",
  "Ateliers créatives : crochet, peinture, scrapbooking, mandalas",
  "Ateliers physiques douces et adaptées : gym douce, parcours de motricité, danse adaptée, marche intérieure ou extérieure",
  "Atelier Musique, Atelier chant, Atelier lecture",
  "Atelier de cuisine",
  "Atelier Jeux et stimulations cognitives",
  "Ateliers numériques",
] as const;

export type Atelier = (typeof ATELIERS)[number];
