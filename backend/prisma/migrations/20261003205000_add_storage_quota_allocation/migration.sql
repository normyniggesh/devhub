-- CreateTable
CREATE TABLE IF NOT EXISTS "StorageAllocation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT,
    "allocatedBytes" BIGINT NOT NULL,
    "reservedBytes" BIGINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StorageAllocation_projectId_key" ON "StorageAllocation"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StorageAllocation_projectId_idx" ON "StorageAllocation"("projectId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'StorageAllocation_projectId_fkey'
    ) THEN
        ALTER TABLE "StorageAllocation" ADD CONSTRAINT "StorageAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
