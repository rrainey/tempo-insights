-- AlterTable
ALTER TABLE "public"."FormationSkydive" ADD COLUMN     "dropzoneId" TEXT;

-- CreateTable
CREATE TABLE "public"."Dropzone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icaoCode" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "elevation" DOUBLE PRECISION NOT NULL,
    "timezone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dropzone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dropzone_slug_key" ON "public"."Dropzone"("slug");

-- CreateIndex
CREATE INDEX "Dropzone_slug_idx" ON "public"."Dropzone"("slug");

-- AddForeignKey
ALTER TABLE "public"."FormationSkydive" ADD CONSTRAINT "FormationSkydive_dropzoneId_fkey" FOREIGN KEY ("dropzoneId") REFERENCES "public"."Dropzone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
