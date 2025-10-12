-- CreateTable
CREATE TABLE "public"."UserInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "groupId" TEXT,
    "groupRole" "public"."GroupRole",
    "userRole" "public"."UserRole" NOT NULL DEFAULT 'USER',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedById" TEXT NOT NULL,
    "usedById" TEXT,

    CONSTRAINT "UserInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserInvitation_code_key" ON "public"."UserInvitation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UserInvitation_usedById_key" ON "public"."UserInvitation"("usedById");

-- CreateIndex
CREATE INDEX "UserInvitation_code_idx" ON "public"."UserInvitation"("code");

-- CreateIndex
CREATE INDEX "UserInvitation_email_idx" ON "public"."UserInvitation"("email");

-- CreateIndex
CREATE INDEX "UserInvitation_invitedById_idx" ON "public"."UserInvitation"("invitedById");

-- AddForeignKey
ALTER TABLE "public"."UserInvitation" ADD CONSTRAINT "UserInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserInvitation" ADD CONSTRAINT "UserInvitation_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserInvitation" ADD CONSTRAINT "UserInvitation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
