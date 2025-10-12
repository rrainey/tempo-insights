-- CreateTable
CREATE TABLE "public"."DeviceFileIndex" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceFileIndex_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceFileIndex_deviceId_idx" ON "public"."DeviceFileIndex"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceFileIndex_deviceId_fileName_key" ON "public"."DeviceFileIndex"("deviceId", "fileName");

-- AddForeignKey
ALTER TABLE "public"."DeviceFileIndex" ADD CONSTRAINT "DeviceFileIndex_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
