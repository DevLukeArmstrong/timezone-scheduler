-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "quorumDirtyAt" TIMESTAMPTZ,
ADD COLUMN     "quorumThreshold" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "QuorumAlert" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "memberIds" TEXT[],
    "startTime" TIMESTAMPTZ NOT NULL,
    "endTime" TIMESTAMPTZ NOT NULL,
    "everyone" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuorumAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuorumAlert_groupId_endTime_idx" ON "QuorumAlert"("groupId", "endTime");

-- AddForeignKey
ALTER TABLE "QuorumAlert" ADD CONSTRAINT "QuorumAlert_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
