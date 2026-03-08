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

  await prisma.userCategory.deleteMany();
  await prisma.adminRecommendation.deleteMany();
  await prisma.intervention.deleteMany();
  await prisma.relation.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.paymentRecord.deleteMany();
  await prisma.report.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  const bricolage = await prisma.category.create({
    data: { name: "Bricolage" },
  });
  const jardinage = await prisma.category.create({
    data: { name: "Jardinage" },
  });
  const informatique = await prisma.category.create({
    data: { name: "Informatique" },
  });

  await prisma.user.create({
    data: {
      email: "admin@feves.fr",
      password: hashedPassword,
      role: "ADMIN",
      status: "ACTIVE",
      firstName: "Admin",
      lastName: "FEVES",
      birthDate: new Date("1980-01-01"),
      phone: "0600000000",
      address: "1 Rue de l'Administration",
      city: "Paris",
      postalCode: "75001",
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
      phone: "0601010101",
      address: "12 Avenue des Fleurs",
      city: "Lyon",
      postalCode: "69001",
      validatorEmail: "aidant@test.fr",
      subscriptionActive: false,
      bio: "Retraité passionné de jardinage, j'ai besoin d'aide pour entretenir mon jardin.",
      trustedPersonName: "Monique Dupont",
      trustedPersonEmail: "aidant@test.fr",
    },
  });

  await prisma.userCategory.create({
    data: { userId: senior1.id, categoryId: jardinage.id },
  });

  const junior1 = await prisma.user.create({
    data: {
      email: "junior@test.fr",
      password: hashedPassword,
      role: "JUNIOR",
      status: "ACTIVE",
      firstName: "Marie",
      lastName: "Martin",
      birthDate: new Date("2000-03-20"),
      phone: "0602020202",
      address: "5 Rue de la Paix",
      city: "Lyon",
      postalCode: "69002",
      validatorEmail: "prof@lycee.fr",
      schoolName: "Lycée Victor Hugo",
      referentTitle: "Mme",
      referentFirstName: "Claire",
      referentLastName: "Leroy",
      referentEmail: "prof@lycee.fr",
      bio: "Étudiante motivée, j'aime aider les personnes âgées et apprendre de leur expérience.",
    },
  });

  await prisma.userCategory.createMany({
    data: [
      { userId: junior1.id, categoryId: jardinage.id },
      { userId: junior1.id, categoryId: bricolage.id },
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
      phone: "0603030303",
      address: "8 Place de la Mairie",
      city: "Marseille",
      postalCode: "13001",
      validatorEmail: "aidant2@test.fr",
      validationToken: randomUUID(),
      validationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      subscriptionActive: false,
      bio: "Ancien professeur, je cherche de l'aide pour mes courses et petits travaux.",
      trustedPersonName: "Sophie Durand",
      trustedPersonEmail: "aidant2@test.fr",
    },
  });

  const junior2 = await prisma.user.create({
    data: {
      email: "junior2@test.fr",
      password: hashedPassword,
      role: "JUNIOR",
      status: "ACTIVE",
      firstName: "Lucas",
      lastName: "Bernard",
      birthDate: new Date("2001-07-12"),
      phone: "0604040404",
      address: "20 Boulevard des Étudiants",
      city: "Lyon",
      postalCode: "69003",
      validatorEmail: "prof2@lycee.fr",
      schoolName: "Lycée La Martinière",
      referentTitle: "M.",
      referentFirstName: "Marc",
      referentLastName: "Petit",
      referentEmail: "prof2@lycee.fr",
      bio: "Passionné d'informatique, je peux aider avec les nouvelles technologies.",
    },
  });

  await prisma.userCategory.create({
    data: { userId: junior2.id, categoryId: informatique.id },
  });

  const relation = await prisma.relation.create({
    data: {
      seniorId: senior1.id,
      juniorId: junior1.id,
      status: "ACTIVE",
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.intervention.create({
    data: {
      relationId: relation.id,
      scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      durationMinutes: 120,
      location: "12 Avenue des Fleurs, 69001 Lyon",
      tasks: ["Taille des rosiers", "Désherbage du potager", "Arrosage"],
      status: "CONFIRMED",
    },
  });

  await prisma.adminRecommendation.create({
    data: {
      seniorId: senior1.id,
      juniorId: junior2.id,
      note: "Lucas est particulièrement compétent en informatique, pourrait aider Jean avec sa tablette.",
    },
  });

  console.log("✅ Seed complet :");
  console.log("   - 1 Admin, 2 Seniors (1 actif, 1 pending), 2 Juniors");
  console.log("   - 3 Catégories (Bricolage, Jardinage, Informatique)");
  console.log("   - 1 Relation ACTIVE (Senior1 ↔ Junior1)");
  console.log("   - 1 Intervention CONFIRMED (dans 7 jours)");
  console.log("   - 1 AdminRecommendation (Senior1 → Junior2)");
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
