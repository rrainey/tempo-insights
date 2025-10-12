-- CreateEnum
CREATE TYPE "public"."CommandStatus" AS ENUM ('QUEUED', 'SENDING', 'COMPLETED', 'DEVICE_ERROR', 'DEVICE_TIMEOUT');

-- CreateEnum
CREATE TYPE "public"."CommandType" AS ENUM ('PING', 'BLINK_ON', 'BLINK_OFF', 'ASSIGN', 'UNPROVISION', 'INITIALIZE');

-- CreateTable
CREATE TABLE "public"."DeviceCommandQueue" (
    "id" TEXT NOT NULL,
    "commandType" "public"."CommandType" NOT NULL,
    "commandStatus" "public"."CommandStatus" NOT NULL DEFAULT 'QUEUED',
    "commandData" JSONB,
    "responseData" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "targetDeviceId" TEXT NOT NULL,
    "sendingUserId" TEXT NOT NULL,

    CONSTRAINT "DeviceCommandQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceCommandQueue_targetDeviceId_commandStatus_idx" ON "public"."DeviceCommandQueue"("targetDeviceId", "commandStatus");

-- CreateIndex
CREATE INDEX "DeviceCommandQueue_commandStatus_idx" ON "public"."DeviceCommandQueue"("commandStatus");

-- CreateIndex
CREATE INDEX "DeviceCommandQueue_createdAt_idx" ON "public"."DeviceCommandQueue"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."DeviceCommandQueue" ADD CONSTRAINT "DeviceCommandQueue_targetDeviceId_fkey" FOREIGN KEY ("targetDeviceId") REFERENCES "public"."Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeviceCommandQueue" ADD CONSTRAINT "DeviceCommandQueue_sendingUserId_fkey" FOREIGN KEY ("sendingUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
