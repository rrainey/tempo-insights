-- CreateTable
CREATE TABLE "public"."MapOverlay" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "storagePath" TEXT NOT NULL,
    "minLon" DOUBLE PRECISION NOT NULL,
    "minLat" DOUBLE PRECISION NOT NULL,
    "maxLon" DOUBLE PRECISION NOT NULL,
    "maxLat" DOUBLE PRECISION NOT NULL,
    "fillColor" TEXT NOT NULL DEFAULT '#22cc44',
    "fillOpacity" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "strokeColor" TEXT NOT NULL DEFAULT '#22cc44',
    "strokeWidth" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "featureCount" INTEGER NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "uploadedById" TEXT NOT NULL,

    UNIQUE ("storagePath"),

    CONSTRAINT "MapOverlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapOverlay_isVisible_idx" ON "public"."MapOverlay"("isVisible");

-- CreateIndex
CREATE INDEX "MapOverlay_uploadedById_idx" ON "public"."MapOverlay"("uploadedById");

-- AddForeignKey
ALTER TABLE "public"."MapOverlay" ADD CONSTRAINT "MapOverlay_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

