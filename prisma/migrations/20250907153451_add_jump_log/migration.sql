-- CreateTable
CREATE TABLE "public"."JumpLog" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "rawLog" BYTEA NOT NULL,
    "offsets" JSONB NOT NULL,
    "flags" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "JumpLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JumpLog_hash_key" ON "public"."JumpLog"("hash");

-- CreateIndex
CREATE INDEX "JumpLog_hash_idx" ON "public"."JumpLog"("hash");

-- CreateIndex
CREATE INDEX "JumpLog_deviceId_idx" ON "public"."JumpLog"("deviceId");

-- CreateIndex
CREATE INDEX "JumpLog_userId_idx" ON "public"."JumpLog"("userId");

-- CreateIndex
CREATE INDEX "JumpLog_createdAt_idx" ON "public"."JumpLog"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."JumpLog" ADD CONSTRAINT "JumpLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JumpLog" ADD CONSTRAINT "JumpLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
