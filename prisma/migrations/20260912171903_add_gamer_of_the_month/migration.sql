-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dismissedGamerOfTheMonthId" TEXT;

-- CreateTable
CREATE TABLE "GamerOfTheMonth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "blurb" TEXT NOT NULL,
    "imageUrl" TEXT,
    "youtubeVideoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GamerOfTheMonth_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_dismissedGamerOfTheMonthId_fkey" FOREIGN KEY ("dismissedGamerOfTheMonthId") REFERENCES "GamerOfTheMonth"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamerOfTheMonth" ADD CONSTRAINT "GamerOfTheMonth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
