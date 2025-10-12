/*
  Warnings:

  - You are about to drop the column `rawLog` on the `JumpLog` table. All the data in the column will be lost.
  - Added the required column `fileSize` to the `JumpLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."JumpLog" DROP COLUMN "rawLog",
ADD COLUMN     "fileSize" INTEGER NOT NULL,
ADD COLUMN     "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
ADD COLUMN     "storagePath" TEXT,
ADD COLUMN     "storageUrl" TEXT;
