-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "discordWebhookUrl" TEXT;

-- AlterTable
ALTER TABLE "NotificationLog" ALTER COLUMN "userId" DROP NOT NULL;
