-- AlterTable
ALTER TABLE "AvailabilitySlot" ADD COLUMN "batchId" TEXT;

-- CreateIndex
CREATE INDEX "AvailabilitySlot_userId_batchId_idx" ON "AvailabilitySlot"("userId", "batchId");
