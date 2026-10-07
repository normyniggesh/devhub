-- CreateTable
CREATE TABLE "FileShare" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sharedWithId" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'VIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FolderShare" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sharedWithId" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'VIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FolderShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileShare_fileId_sharedWithId_key" ON "FileShare"("fileId", "sharedWithId");

-- CreateIndex
CREATE INDEX "FileShare_fileId_idx" ON "FileShare"("fileId");

-- CreateIndex
CREATE INDEX "FileShare_ownerId_idx" ON "FileShare"("ownerId");

-- CreateIndex
CREATE INDEX "FileShare_sharedWithId_idx" ON "FileShare"("sharedWithId");

-- CreateIndex
CREATE UNIQUE INDEX "FolderShare_folderId_sharedWithId_key" ON "FolderShare"("folderId", "sharedWithId");

-- CreateIndex
CREATE INDEX "FolderShare_folderId_idx" ON "FolderShare"("folderId");

-- CreateIndex
CREATE INDEX "FolderShare_ownerId_idx" ON "FolderShare"("ownerId");

-- CreateIndex
CREATE INDEX "FolderShare_sharedWithId_idx" ON "FolderShare"("sharedWithId");

-- AddForeignKey
ALTER TABLE "FileShare" ADD CONSTRAINT "FileShare_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileShare" ADD CONSTRAINT "FileShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileShare" ADD CONSTRAINT "FileShare_sharedWithId_fkey" FOREIGN KEY ("sharedWithId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderShare" ADD CONSTRAINT "FolderShare_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderShare" ADD CONSTRAINT "FolderShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderShare" ADD CONSTRAINT "FolderShare_sharedWithId_fkey" FOREIGN KEY ("sharedWithId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
