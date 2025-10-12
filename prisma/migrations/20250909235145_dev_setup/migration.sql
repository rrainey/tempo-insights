-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "public"."DeviceState" AS ENUM ('ACTIVE', 'INACTIVE', 'PROVISIONING');

-- CreateEnum
CREATE TYPE "public"."GroupRole" AS ENUM ('MEMBER', 'ADMIN', 'OWNER');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Device" (
    "id" TEXT NOT NULL,
    "bluetoothId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" "public"."DeviceState" NOT NULL DEFAULT 'ACTIVE',
    "lastSeen" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "lentToId" TEXT,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JumpLog" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "rawLog" BYTEA NOT NULL,
    "offsets" JSONB NOT NULL,
    "flags" JSONB NOT NULL,
    "visibleToConnections" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "JumpLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GroupMember" (
    "id" TEXT NOT NULL,
    "role" "public"."GroupRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FormationSkydive" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jumpTime" TIMESTAMP(3) NOT NULL,
    "aircraft" TEXT,
    "altitude" INTEGER,
    "notes" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormationSkydive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FormationParticipant" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "formationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jumpLogId" TEXT NOT NULL,

    CONSTRAINT "FormationParticipant_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_slug_key" ON "public"."User"("slug");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_slug_idx" ON "public"."User"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Device_bluetoothId_key" ON "public"."Device"("bluetoothId");

-- CreateIndex
CREATE INDEX "Device_bluetoothId_idx" ON "public"."Device"("bluetoothId");

-- CreateIndex
CREATE INDEX "Device_ownerId_idx" ON "public"."Device"("ownerId");

-- CreateIndex
CREATE INDEX "Device_lentToId_idx" ON "public"."Device"("lentToId");

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

-- CreateIndex
CREATE UNIQUE INDEX "Group_slug_key" ON "public"."Group"("slug");

-- CreateIndex
CREATE INDEX "Group_slug_idx" ON "public"."Group"("slug");

-- CreateIndex
CREATE INDEX "GroupMember_userId_idx" ON "public"."GroupMember"("userId");

-- CreateIndex
CREATE INDEX "GroupMember_groupId_idx" ON "public"."GroupMember"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_userId_groupId_key" ON "public"."GroupMember"("userId", "groupId");

-- CreateIndex
CREATE INDEX "FormationSkydive_jumpTime_idx" ON "public"."FormationSkydive"("jumpTime");

-- CreateIndex
CREATE UNIQUE INDEX "FormationParticipant_jumpLogId_key" ON "public"."FormationParticipant"("jumpLogId");

-- CreateIndex
CREATE INDEX "FormationParticipant_formationId_idx" ON "public"."FormationParticipant"("formationId");

-- CreateIndex
CREATE INDEX "FormationParticipant_userId_idx" ON "public"."FormationParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FormationParticipant_formationId_position_key" ON "public"."FormationParticipant"("formationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "FormationParticipant_formationId_userId_key" ON "public"."FormationParticipant"("formationId", "userId");

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
ALTER TABLE "public"."Device" ADD CONSTRAINT "Device_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Device" ADD CONSTRAINT "Device_lentToId_fkey" FOREIGN KEY ("lentToId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JumpLog" ADD CONSTRAINT "JumpLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JumpLog" ADD CONSTRAINT "JumpLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FormationParticipant" ADD CONSTRAINT "FormationParticipant_formationId_fkey" FOREIGN KEY ("formationId") REFERENCES "public"."FormationSkydive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FormationParticipant" ADD CONSTRAINT "FormationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FormationParticipant" ADD CONSTRAINT "FormationParticipant_jumpLogId_fkey" FOREIGN KEY ("jumpLogId") REFERENCES "public"."JumpLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserInvitation" ADD CONSTRAINT "UserInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserInvitation" ADD CONSTRAINT "UserInvitation_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserInvitation" ADD CONSTRAINT "UserInvitation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
