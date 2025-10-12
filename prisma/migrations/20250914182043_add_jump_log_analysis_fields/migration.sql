-- AlterTable
ALTER TABLE "public"."JumpLog" ADD COLUMN     "avgFallRateMph" DOUBLE PRECISION,
ADD COLUMN     "deployAltitudeFt" INTEGER,
ADD COLUMN     "deploymentOffsetSec" DOUBLE PRECISION,
ADD COLUMN     "exitAltitudeFt" INTEGER,
ADD COLUMN     "exitLatitude" DOUBLE PRECISION,
ADD COLUMN     "exitLongitude" DOUBLE PRECISION,
ADD COLUMN     "exitOffsetSec" DOUBLE PRECISION,
ADD COLUMN     "exitTimestampUTC" TIMESTAMP(3),
ADD COLUMN     "freefallTimeSec" DOUBLE PRECISION,
ADD COLUMN     "initialAnalysisMessage" TEXT,
ADD COLUMN     "initialAnalysisTimestamp" TIMESTAMP(3),
ADD COLUMN     "landingOffsetSec" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "JumpLog_initialAnalysisTimestamp_idx" ON "public"."JumpLog"("initialAnalysisTimestamp");
