-- AlterTable
ALTER TABLE "Room" DROP CONSTRAINT IF EXISTS "Room_name_key";
ALTER TABLE "Room" ADD COLUMN "isGroup" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Room" ALTER COLUMN "name" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RoomMember" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'member';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Room_name_idx" ON "Room"("name");
