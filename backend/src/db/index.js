const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Automatically ensure schema columns exist on connected PostgreSQL (Neon / Production)
async function ensureSchema() {
  if (!process.env.DATABASE_URL) return;
  try {
    await pool.query(`
      ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
      CREATE INDEX IF NOT EXISTS "AuditLog_projectId_idx" ON "AuditLog"("projectId");

      ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "userId" TEXT;
      ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "description" TEXT;
      ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "starsCount" INTEGER DEFAULT 0;
      ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "forksCount" INTEGER DEFAULT 0;
      ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "openIssuesCount" INTEGER DEFAULT 0;
      ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "language" TEXT;
      ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "isPrivate" BOOLEAN DEFAULT false;
      ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "pushedAt" TIMESTAMP(3);

      -- Allow repositories to be personal (not attached to any project)
      ALTER TABLE "Repository" ALTER COLUMN "projectId" DROP NOT NULL;
      CREATE INDEX IF NOT EXISTS "Repository_userId_idx" ON "Repository"("userId");
      CREATE INDEX IF NOT EXISTS "Repository_projectId_idx" ON "Repository"("projectId");

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'Repository_userId_fkey'
        ) THEN
          ALTER TABLE "Repository" 
          ADD CONSTRAINT "Repository_userId_fkey" 
          FOREIGN KEY ("userId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL;
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS "UserIntegration" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "provider" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'connected',
        "accountName" TEXT,
        "accessToken" TEXT,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- Deduplicate if any duplicate entries were created before unique constraint was applied
      DELETE FROM "UserIntegration" a
      USING "UserIntegration" b
      WHERE a.ctid < b.ctid
        AND a."userId" = b."userId"
        AND a."provider" = b."provider";

      -- Ensure unique constraint on (userId, provider) required by Prisma upsert ON CONFLICT
      CREATE UNIQUE INDEX IF NOT EXISTS "UserIntegration_userId_provider_key"
      ON "UserIntegration"("userId", "provider");

      -- Index on userId for fast lookups
      CREATE INDEX IF NOT EXISTS "UserIntegration_userId_idx"
      ON "UserIntegration"("userId");
    `);
    console.log('[DB] Schema verified successfully.');
  } catch (err) {
    console.error('[DB] Schema verification error (non-fatal):', err.message);
  }
}

ensureSchema();

module.exports = prisma;
