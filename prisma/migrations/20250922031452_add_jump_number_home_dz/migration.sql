-- AlterTable
ALTER TABLE "public"."JumpLog" ADD COLUMN     "jumpNumber" INTEGER;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "homeDropzoneId" TEXT,
ADD COLUMN     "nextJumpNumber" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "JumpLog_jumpNumber_idx" ON "public"."JumpLog"("jumpNumber");

-- CreateIndex
CREATE INDEX "User_homeDropzoneId_idx" ON "public"."User"("homeDropzoneId");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_homeDropzoneId_fkey" FOREIGN KEY ("homeDropzoneId") REFERENCES "public"."Dropzone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
