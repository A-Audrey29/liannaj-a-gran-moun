-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MEETING_CHECK';

-- AlterTable
ALTER TABLE "Intervention" ADD COLUMN     "meetingCheckReminderSentAt" TIMESTAMP(3);
