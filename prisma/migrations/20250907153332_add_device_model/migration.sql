-- CreateEnum
CREATE TYPE "public"."DeviceState" AS ENUM ('ACTIVE', 'INACTIVE', 'PROVISIONING');

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

-- CreateIndex
CREATE UNIQUE INDEX "Device_bluetoothId_key" ON "public"."Device"("bluetoothId");

-- CreateIndex
CREATE INDEX "Device_bluetoothId_idx" ON "public"."Device"("bluetoothId");

-- CreateIndex
CREATE INDEX "Device_ownerId_idx" ON "public"."Device"("ownerId");

-- CreateIndex
CREATE INDEX "Device_lentToId_idx" ON "public"."Device"("lentToId");

-- AddForeignKey
ALTER TABLE "public"."Device" ADD CONSTRAINT "Device_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Device" ADD CONSTRAINT "Device_lentToId_fkey" FOREIGN KEY ("lentToId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
