-- AlterTable
ALTER TABLE "FileShare" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "FolderShare" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "registrationCodeId" TEXT;

-- CreateTable
CREATE TABLE "RegistrationCode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationCode_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_registrationCodeId_fkey" FOREIGN KEY ("registrationCodeId") REFERENCES "RegistrationCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

