-- DropForeignKey
ALTER TABLE "Internship" DROP CONSTRAINT "Internship_studentId_fkey";

-- DropTable
DROP TABLE "Internship";

-- DropEnum
DROP TYPE "InternshipStatus";
