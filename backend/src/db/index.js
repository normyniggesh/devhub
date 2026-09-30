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
