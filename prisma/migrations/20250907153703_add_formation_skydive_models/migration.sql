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

-- AddForeignKey
ALTER TABLE "public"."FormationParticipant" ADD CONSTRAINT "FormationParticipant_formationId_fkey" FOREIGN KEY ("formationId") REFERENCES "public"."FormationSkydive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FormationParticipant" ADD CONSTRAINT "FormationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FormationParticipant" ADD CONSTRAINT "FormationParticipant_jumpLogId_fkey" FOREIGN KEY ("jumpLogId") REFERENCES "public"."JumpLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
