-- CreateTable
CREATE TABLE "FavoriteTimeZone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "FavoriteTimeZone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteTimeZone_userId_timeZone_key" ON "FavoriteTimeZone"("userId", "timeZone");

-- CreateIndex
CREATE INDEX "FavoriteTimeZone_userId_position_idx" ON "FavoriteTimeZone"("userId", "position");

-- AddForeignKey
ALTER TABLE "FavoriteTimeZone" ADD CONSTRAINT "FavoriteTimeZone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
