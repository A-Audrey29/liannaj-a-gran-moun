import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const hashedPassword = await bcrypt.hash("password", 10);

  await prisma.report.deleteMany();
  await prisma.userCategory.deleteMany();
  await prisma.adminRecommendation.deleteMany();
  await prisma.intervention.deleteMany();
  await prisma.relation.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.paymentRecord.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  const bricolage = await prisma.category.create({ data: { name: "Bricolage" } });
  const jardinage = await prisma.category.create({ data: { name: "Jardinage" } });
  const informatique = await prisma.category.create({ data: { name: "Informatique" } });
  const cuisine = await prisma.category.create({ data: { name: "Cuisine" } });
  const lecture = await prisma.category.create({ data: { name: "Lecture" } });
  const promenade = await prisma.category.create({ data: { name: "Promenade" } });

  const admin = await prisma.user.create({
    data: {
      email: "admin@feves.fr",
      password: hashedPassword,
      role: "ADMIN",
      status: "ACTIVE",
      firstName: "Admin",
      lastName: "FEVES",
      birthDate: new Date("1980-01-01"),
      phone: "0590000000",
      address: "1 Boulevard Légitimus",
      city: "Pointe-à-Pitre",
      postalCode: "97110",
    },
  });

  const senior1 = await prisma.user.create({
    data: {
      email: "senior@test.fr",
      password: hashedPassword,
      role: "SENIOR",
      status: "ACTIVE",
      firstName: "Jean",
      lastName: "Dupont",
      birthDate: new Date("1950-05-15"),
      phone: "0690010101",
      address: "12 Rue des Flamboyants",
      city: "Les Abymes",
      postalCode: "97139",
      validatorEmail: "aidant@test.fr",
      subscriptionActive: false,
      bio: "Retraité passionné de jardinage, j'ai besoin d'aide pour entretenir mon jardin créole.",
      trustedPersonName: "Monique Dupont",
      trustedPersonEmail: "aidant@test.fr",
    },
  });
  await prisma.userCategory.create({ data: { userId: senior1.id, categoryId: jardinage.id } });

  const senior2 = await prisma.user.create({
    data: {
      email: "senior2@test.fr",
      password: hashedPassword,
      role: "SENIOR",
      status: "ACTIVE",
      firstName: "Madeleine",
      lastName: "Fontaine",
      birthDate: new Date("1950-02-18"),
      phone: "0690020202",
      address: "8 Impasse des Bougainvilliers",
      city: "Les Abymes",
      postalCode: "97139",
      validatorEmail: "famille.fontaine@test.fr",
      subscriptionActive: false,
      bio: "Ancienne institutrice, j'adore cuisiner les plats traditionnels et partager mes recettes créoles. La lecture est ma passion.",
      trustedPersonName: "Yolande Fontaine",
      trustedPersonEmail: "famille.fontaine@test.fr",
    },
  });
  await prisma.userCategory.createMany({
    data: [
      { userId: senior2.id, categoryId: cuisine.id },
      { userId: senior2.id, categoryId: lecture.id },
    ],
  });

  const senior3 = await prisma.user.create({
    data: {
      email: "senior3@test.fr",
      password: hashedPassword,
      role: "SENIOR",
      status: "ACTIVE",
      firstName: "Georges",
      lastName: "Blanc",
      birthDate: new Date("1944-08-22"),
      phone: "0690030303",
      address: "22 Route de Dothémare",
      city: "Les Abymes",
      postalCode: "97139",
      validatorEmail: "aidant.blanc@test.fr",
      subscriptionActive: true,
      bio: "Ancien charpentier, j'ai toujours les mains habiles mais j'ai besoin d'un coup de main pour les gros travaux et le jardin.",
      trustedPersonName: "Lucien Blanc",
      trustedPersonEmail: "aidant.blanc@test.fr",
    },
  });
  await prisma.userCategory.createMany({
    data: [
      { userId: senior3.id, categoryId: bricolage.id },
      { userId: senior3.id, categoryId: jardinage.id },
    ],
  });

  const senior4 = await prisma.user.create({
    data: {
      email: "senior4@test.fr",
      password: hashedPassword,
      role: "SENIOR",
      status: "ACTIVE",
      firstName: "Simone",
      lastName: "Rousseau",
      birthDate: new Date("1955-04-30"),
      phone: "0690040404",
      address: "15 Lotissement les Orchidées",
      city: "Les Abymes",
      postalCode: "97139",
      validatorEmail: "famille.rousseau@test.fr",
      subscriptionActive: false,
      bio: "Je veux apprendre à utiliser mon téléphone et ma tablette. J'aime aussi les promenades le matin au bord de mer.",
      trustedPersonName: "Claudine Rousseau",
      trustedPersonEmail: "famille.rousseau@test.fr",
    },
  });
  await prisma.userCategory.createMany({
    data: [
      { userId: senior4.id, categoryId: informatique.id },
      { userId: senior4.id, categoryId: promenade.id },
    ],
  });

  const senior5 = await prisma.user.create({
    data: {
      email: "senior5@test.fr",
      password: hashedPassword,
      role: "SENIOR",
      status: "ACTIVE",
      firstName: "René",
      lastName: "Moreau",
      birthDate: new Date("1948-11-05"),
      phone: "0690050505",
      address: "3 Chemin des Manguiers",
      city: "Les Abymes",
      postalCode: "97139",
      validatorEmail: "aidant.moreau@test.fr",
      subscriptionActive: false,
      bio: "Retraité polyvalent, j'aime cuisiner, jardiner et me promener. Cherche compagnie pour partager ces moments.",
      trustedPersonName: "André Moreau",
      trustedPersonEmail: "aidant.moreau@test.fr",
    },
  });
  await prisma.userCategory.createMany({
    data: [
      { userId: senior5.id, categoryId: cuisine.id },
      { userId: senior5.id, categoryId: promenade.id },
      { userId: senior5.id, categoryId: jardinage.id },
    ],
  });

  const junior1 = await prisma.user.create({
    data: {
      email: "junior@test.fr",
      password: hashedPassword,
      role: "JUNIOR",
      status: "ACTIVE",
      firstName: "Marie",
      lastName: "Martin",
      birthDate: new Date("2005-03-20"),
      phone: "0690060606",
      address: "5 Résidence les Alizés",
      city: "Les Abymes",
      postalCode: "97139",
      validatorEmail: "prof@lycee-abymes.fr",
      schoolName: "Lycée Gerville-Réache",
      referentTitle: "Mme",
      referentFirstName: "Claire",
      referentLastName: "Leroy",
      referentEmail: "prof@lycee-abymes.fr",
      bio: "Lycéenne motivée, j'aime aider les gran moun et apprendre de leur expérience. Le jardinage et le bricolage m'intéressent.",
    },
  });
  await prisma.userCategory.createMany({
    data: [
      { userId: junior1.id, categoryId: jardinage.id },
      { userId: junior1.id, categoryId: bricolage.id },
    ],
  });

  const junior2 = await prisma.user.create({
    data: {
      email: "junior2@test.fr",
      password: hashedPassword,
      role: "JUNIOR",
      status: "ACTIVE",
      firstName: "Lucas",
      lastName: "Bernard",
      birthDate: new Date("2004-07-12"),
      phone: "0690070707",
      address: "20 Cité Grand Camp",
      city: "Les Abymes",
      postalCode: "97139",
      validatorEmail: "prof2@lycee-abymes.fr",
      schoolName: "Lycée Baimbridge",
      referentTitle: "M.",
      referentFirstName: "Marc",
      referentLastName: "Petit",
      referentEmail: "prof2@lycee-abymes.fr",
      bio: "Passionné d'informatique et de nouvelles technologies, je peux aider avec les smartphones et ordinateurs.",
    },
  });
  await prisma.userCategory.create({ data: { userId: junior2.id, categoryId: informatique.id } });

  const junior3 = await prisma.user.create({
    data: {
      email: "junior3@test.fr",
      password: hashedPassword,
      role: "JUNIOR",
      status: "ACTIVE",
      firstName: "Emma",
      lastName: "Lefèvre",
      birthDate: new Date("2007-01-14"),
      phone: "0690080808",
      address: "10 Rue Amédée Fengarol",
      city: "Les Abymes",
      postalCode: "97139",
      validatorEmail: "ref.lefevre@college-abymes.fr",
      schoolName: "Collège Front de Mer",
      referentTitle: "Mme",
      referentFirstName: "Nathalie",
      referentLastName: "Cédras",
      referentEmail: "ref.lefevre@college-abymes.fr",
      bio: "J'adore la cuisine créole et le jardinage. Ma grand-mère m'a transmis l'amour des plantes et des recettes traditionnelles.",
    },
  });
  await prisma.userCategory.createMany({
    data: [
      { userId: junior3.id, categoryId: cuisine.id },
      { userId: junior3.id, categoryId: jardinage.id },
    ],
  });

  const junior4 = await prisma.user.create({
    data: {
      email: "junior4@test.fr",
      password: hashedPassword,
      role: "JUNIOR",
      status: "ACTIVE",
      firstName: "Théo",
      lastName: "Garcia",
      birthDate: new Date("2006-09-03"),
      phone: "0690090909",
      address: "7 Résidence Raizet",
      city: "Les Abymes",
      postalCode: "97139",
      validatorEmail: "ref.garcia@lycee-baimbridge.fr",
      schoolName: "Lycée Baimbridge",
      referentTitle: "M.",
      referentFirstName: "Philippe",
      referentLastName: "Morin",
      referentEmail: "ref.garcia@lycee-baimbridge.fr",
      bio: "Bon bricoleur et passionné de tech, je veux aider les seniors avec les travaux pratiques et l'informatique.",
    },
  });
  await prisma.userCategory.createMany({
    data: [
      { userId: junior4.id, categoryId: informatique.id },
      { userId: junior4.id, categoryId: bricolage.id },
    ],
  });

  const junior5 = await prisma.user.create({
    data: {
      email: "junior5@test.fr",
      password: hashedPassword,
      role: "JUNIOR",
      status: "ACTIVE",
      firstName: "Léa",
      lastName: "Dubois",
      birthDate: new Date("2008-05-22"),
      phone: "0690101010",
      address: "14 Allée des Cocotiers",
      city: "Les Abymes",
      postalCode: "97139",
      validatorEmail: "ref.dubois@college-abymes.fr",
      schoolName: "Collège Aurore",
      referentTitle: "Mme",
      referentFirstName: "Isabelle",
      referentLastName: "Damour",
      referentEmail: "ref.dubois@college-abymes.fr",
      bio: "J'aime lire et me promener. Très patiente, je veux tenir compagnie aux personnes âgées et partager des moments calmes.",
    },
  });
  await prisma.userCategory.createMany({
    data: [
      { userId: junior5.id, categoryId: lecture.id },
      { userId: junior5.id, categoryId: promenade.id },
    ],
  });

  const junior6 = await prisma.user.create({
    data: {
      email: "junior6@test.fr",
      password: hashedPassword,
      role: "JUNIOR",
      status: "ACTIVE",
      firstName: "Nathan",
      lastName: "Petit",
      birthDate: new Date("2005-11-30"),
      phone: "0690111111",
      address: "25 Route de Blanchard",
      city: "Les Abymes",
      postalCode: "97139",
      validatorEmail: "ref.petit@lycee-gerville.fr",
      schoolName: "Lycée Gerville-Réache",
      referentTitle: "M.",
      referentFirstName: "Daniel",
      referentLastName: "Boisvert",
      referentEmail: "ref.petit@lycee-gerville.fr",
      bio: "Polyvalent et dynamique, je peux aider en cuisine, bricolage ou accompagner en promenade. J'aime rendre service.",
    },
  });
  await prisma.userCategory.createMany({
    data: [
      { userId: junior6.id, categoryId: cuisine.id },
      { userId: junior6.id, categoryId: promenade.id },
      { userId: junior6.id, categoryId: bricolage.id },
    ],
  });

  await prisma.user.create({
    data: {
      email: "senior.pending@test.fr",
      password: hashedPassword,
      role: "SENIOR",
      status: "PENDING_VALIDATION",
      firstName: "Pierre",
      lastName: "Durand",
      birthDate: new Date("1945-12-10"),
      phone: "0690121212",
      address: "8 Place de la Victoire",
      city: "Pointe-à-Pitre",
      postalCode: "97110",
      validatorEmail: "aidant2@test.fr",
      validationToken: randomUUID(),
      validationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      subscriptionActive: false,
      bio: "Ancien professeur, je cherche de l'aide pour mes courses et petits travaux à la maison.",
      trustedPersonName: "Sophie Durand",
      trustedPersonEmail: "aidant2@test.fr",
    },
  });

  const relation1 = await prisma.relation.create({
    data: {
      seniorId: senior1.id,
      juniorId: junior1.id,
      status: "ACTIVE",
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.intervention.create({
    data: {
      relationId: relation1.id,
      scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      durationMinutes: 120,
      location: "12 Rue des Flamboyants, 97139 Les Abymes",
      tasks: ["Taille des rosiers", "Désherbage du potager", "Arrosage"],
      status: "CONFIRMED",
    },
  });

  await prisma.relation.create({
    data: {
      seniorId: senior5.id,
      juniorId: junior3.id,
      status: "PENDING",
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
  });

  const relation3 = await prisma.relation.create({
    data: {
      seniorId: senior2.id,
      juniorId: junior5.id,
      status: "PENDING_FIRST_MEETING",
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.intervention.create({
    data: {
      relationId: relation3.id,
      scheduledDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      durationMinutes: 60,
      location: "Médiathèque Paul Mado, Les Abymes",
      tasks: ["Première rencontre encadrée", "Présentation mutuelle", "Échange autour de la lecture"],
      status: "CONFIRMED",
    },
  });

  const relation4 = await prisma.relation.create({
    data: {
      seniorId: senior3.id,
      juniorId: junior4.id,
      status: "ACTIVE",
      createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.intervention.create({
    data: {
      relationId: relation4.id,
      scheduledDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      durationMinutes: 90,
      location: "22 Route de Dothémare, 97139 Les Abymes",
      tasks: ["Réparation volet", "Fixation étagère"],
      status: "COMPLETED",
      seniorRating: 5,
      seniorComment: "Théo est très habile de ses mains, travail impeccable !",
      juniorRating: 4,
      juniorComment: "M. Blanc m'a appris plein de techniques, super expérience.",
    },
  });

  await prisma.intervention.create({
    data: {
      relationId: relation4.id,
      scheduledDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      durationMinutes: 120,
      location: "22 Route de Dothémare, 97139 Les Abymes",
      tasks: ["Tonte pelouse", "Désherbage"],
      status: "PROPOSED",
    },
  });

  const relation5 = await prisma.relation.create({
    data: {
      seniorId: senior4.id,
      juniorId: junior6.id,
      status: "ACTIVE",
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.intervention.create({
    data: {
      relationId: relation5.id,
      scheduledDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      durationMinutes: 60,
      location: "Plage du Gosier",
      tasks: ["Promenade bord de mer", "Courses au marché"],
      status: "COMPLETED",
      seniorRating: 5,
      seniorComment: "Nathan est adorable, très prévenant et agréable compagnie.",
      juniorRating: 5,
      juniorComment: "Mme Rousseau est formidable, on a passé un super moment ensemble.",
    },
  });

  await prisma.intervention.create({
    data: {
      relationId: relation5.id,
      scheduledDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      durationMinutes: 90,
      location: "15 Lotissement les Orchidées, 97139 Les Abymes",
      tasks: ["Configuration tablette", "Installation WhatsApp"],
      status: "COMPLETED_PENDING_FEEDBACK",
      seniorRating: 4,
      seniorComment: "Nathan m'a bien expliqué, je comprends mieux ma tablette maintenant.",
    },
  });

  await prisma.adminRecommendation.create({
    data: {
      seniorId: senior1.id,
      juniorId: junior2.id,
      note: "Lucas est particulièrement compétent en informatique, pourrait aider Jean avec sa tablette.",
    },
  });

  await prisma.adminRecommendation.create({
    data: {
      seniorId: senior2.id,
      juniorId: junior3.id,
      note: "Emma et Madeleine partagent la passion de la cuisine créole, un excellent duo potentiel.",
    },
  });

  await prisma.paymentRecord.create({
    data: {
      userId: senior3.id,
      amount: 15.00,
      label: "Abonnement mensuel mars 2026",
      date: new Date(),
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: junior3.id,
        type: "RELATION_REQUEST",
        title: "Nouvelle demande de relation",
        message: "René Moreau souhaite vous rencontrer. Consultez la demande.",
        link: null,
        isRead: false,
      },
      {
        userId: senior2.id,
        type: "RELATION_REQUEST",
        title: "Demande acceptée",
        message: "Léa Dubois a accepté votre demande de relation. Un administrateur va organiser la première rencontre.",
        link: null,
        isRead: true,
      },
      {
        userId: junior4.id,
        type: "INTERVENTION_PROPOSED",
        title: "Nouvelle intervention proposée",
        message: "Georges Blanc propose une intervention le " + new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString("fr-FR") + ".",
        link: null,
        isRead: false,
      },
      {
        userId: junior6.id,
        type: "FEEDBACK_REMINDER",
        title: "Feedback requis",
        message: "L'intervention avec Simone Rousseau a été validée. Merci de laisser votre feedback.",
        link: null,
        isRead: false,
      },
    ],
  });

  console.log("✅ Seed complet (Guadeloupe) :");
  console.log("   - 1 Admin (Pointe-à-Pitre)");
  console.log("   - 6 Seniors : 5 actifs (Les Abymes) + 1 pending (Pointe-à-Pitre)");
  console.log("   - 6 Juniors actifs (Les Abymes)");
  console.log("   - 6 Catégories : Bricolage, Jardinage, Informatique, Cuisine, Lecture, Promenade");
  console.log("   - 5 Relations : 1 PENDING, 1 PENDING_FIRST_MEETING, 3 ACTIVE");
  console.log("   - 6 Interventions : 2 CONFIRMED, 1 PROPOSED, 2 COMPLETED, 1 COMPLETED_PENDING_FEEDBACK");
  console.log("   - 2 AdminRecommendations, 1 Paiement, 4 Notifications");
  console.log("   - Mot de passe pour tous : password");
}

main()
  .catch((e) => {
    console.error("❌ Erreur seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
