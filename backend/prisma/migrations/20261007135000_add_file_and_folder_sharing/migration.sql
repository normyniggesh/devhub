-- CreateTable
CREATE TABLE IF NOT EXISTS "FileShare" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sharedWithId" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'VIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FolderShare" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sharedWithId" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'VIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FolderShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FileShare_fileId_sharedWithId_key" ON "FileShare"("fileId", "sharedWithId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FileShare_fileId_idx" ON "FileShare"("fileId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FileShare_ownerId_idx" ON "FileShare"("ownerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FileShare_sharedWithId_idx" ON "FileShare"("sharedWithId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FolderShare_folderId_sharedWithId_key" ON "FolderShare"("folderId", "sharedWithId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FolderShare_folderId_idx" ON "FolderShare"("folderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FolderShare_ownerId_idx" ON "FolderShare"("ownerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FolderShare_sharedWithId_idx" ON "FolderShare"("sharedWithId");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FileShare_fileId_fkey') THEN
        ALTER TABLE "FileShare" ADD CONSTRAINT "FileShare_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FileShare_ownerId_fkey') THEN
        ALTER TABLE "FileShare" ADD CONSTRAINT "FileShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FileShare_sharedWithId_fkey') THEN
        ALTER TABLE "FileShare" ADD CONSTRAINT "FileShare_sharedWithId_fkey" FOREIGN KEY ("sharedWithId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FolderShare_folderId_fkey') THEN
        ALTER TABLE "FolderShare" ADD CONSTRAINT "FolderShare_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FolderShare_ownerId_fkey') THEN
        ALTER TABLE "FolderShare" ADD CONSTRAINT "FolderShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FolderShare_sharedWithId_fkey') THEN
        ALTER TABLE "FolderShare" ADD CONSTRAINT "FolderShare_sharedWithId_fkey" FOREIGN KEY ("sharedWithId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
