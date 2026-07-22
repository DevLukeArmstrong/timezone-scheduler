-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- AlterTable
ALTER TABLE "GroupMembership" ADD COLUMN     "role" "GroupRole" NOT NULL DEFAULT 'MEMBER';

-- Backfill: every existing group's creator becomes OWNER of their own
-- membership row. Every other pre-existing membership keeps the column
-- default (MEMBER), matching "group creator is OWNER, existing members
-- MEMBER" — no admins existed before this migration.
UPDATE "GroupMembership" AS gm
SET "role" = 'OWNER'
FROM "Group" AS g
WHERE g.id = gm."groupId"
  AND g."ownerId" = gm."userId";
