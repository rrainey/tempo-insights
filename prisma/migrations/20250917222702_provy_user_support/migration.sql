-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "isProxy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proxyCreatorId" TEXT;

-- CreateIndex
CREATE INDEX "User_proxyCreatorId_idx" ON "public"."User"("proxyCreatorId");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_proxyCreatorId_fkey" FOREIGN KEY ("proxyCreatorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
