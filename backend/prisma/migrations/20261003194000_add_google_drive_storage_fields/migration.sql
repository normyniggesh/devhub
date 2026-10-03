-- AlterTable
ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "driveFileId" TEXT;
ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "storageProvider" TEXT NOT NULL DEFAULT 's3';
ALTER TABLE "File" ALTER COLUMN "size" TYPE BIGINT;

-- AlterTable
ALTER TABLE "Folder" ADD COLUMN IF NOT EXISTS "driveFolderId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "driveFolderId" TEXT;

-- Update existing File records to ensure storageProvider is 's3'
UPDATE "File" SET "storageProvider" = 's3' WHERE "storageProvider" IS NULL;
