-- CreateTable
CREATE TABLE "public"."Connection" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId1" TEXT NOT NULL,
    "userId2" TEXT NOT NULL,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConnectionRequest" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,

    CONSTRAINT "ConnectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Connection_userId1_idx" ON "public"."Connection"("userId1");

-- CreateIndex
CREATE INDEX "Connection_userId2_idx" ON "public"."Connection"("userId2");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_userId1_userId2_key" ON "public"."Connection"("userId1", "userId2");

-- CreateIndex
CREATE INDEX "ConnectionRequest_fromUserId_idx" ON "public"."ConnectionRequest"("fromUserId");

-- CreateIndex
CREATE INDEX "ConnectionRequest_toUserId_idx" ON "public"."ConnectionRequest"("toUserId");

-- CreateIndex
CREATE INDEX "ConnectionRequest_status_idx" ON "public"."ConnectionRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectionRequest_fromUserId_toUserId_key" ON "public"."ConnectionRequest"("fromUserId", "toUserId");

-- AddForeignKey
ALTER TABLE "public"."Connection" ADD CONSTRAINT "Connection_userId1_fkey" FOREIGN KEY ("userId1") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Connection" ADD CONSTRAINT "Connection_userId2_fkey" FOREIGN KEY ("userId2") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConnectionRequest" ADD CONSTRAINT "ConnectionRequest_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConnectionRequest" ADD CONSTRAINT "ConnectionRequest_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
