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

      -- QA System Enhancements: Connect TestCase, TestResult (Runs), and Bug
      ALTER TABLE "TestCase" ADD COLUMN IF NOT EXISTS "assigneeId" TEXT;
      ALTER TABLE "TestCase" ADD COLUMN IF NOT EXISTS "actualResult" TEXT;
      ALTER TABLE "TestCase" ALTER COLUMN "status" SET DEFAULT 'Not Tested';
      CREATE INDEX IF NOT EXISTS "TestCase_assigneeId_idx" ON "TestCase"("assigneeId");

      ALTER TABLE "TestResult" ADD COLUMN IF NOT EXISTS "notes" TEXT;
      ALTER TABLE "TestResult" ALTER COLUMN "testRunId" DROP NOT NULL;

      ALTER TABLE "Bug" ADD COLUMN IF NOT EXISTS "testResultId" TEXT;
      ALTER TABLE "Bug" ADD COLUMN IF NOT EXISTS "expectedResult" TEXT;
      ALTER TABLE "Bug" ADD COLUMN IF NOT EXISTS "actualResult" TEXT;
      CREATE INDEX IF NOT EXISTS "Bug_testResultId_idx" ON "Bug"("testResultId");
      CREATE INDEX IF NOT EXISTS "Bug_testCaseId_idx" ON "Bug"("testCaseId");

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'TestCase_assigneeId_fkey'
        ) THEN
          ALTER TABLE "TestCase" 
          ADD CONSTRAINT "TestCase_assigneeId_fkey" 
          FOREIGN KEY ("assigneeId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'Bug_testResultId_fkey'
        ) THEN
          ALTER TABLE "Bug" 
          ADD CONSTRAINT "Bug_testResultId_fkey" 
          FOREIGN KEY ("testResultId") REFERENCES "TestResult"(id) ON UPDATE CASCADE ON DELETE SET NULL;
        END IF;

        -- Test Case Claiming / Tester
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'TestCase_testerId_fkey'
        ) THEN
          ALTER TABLE "TestCase" ADD COLUMN IF NOT EXISTS "testerId" TEXT;
          CREATE INDEX IF NOT EXISTS "TestCase_testerId_idx" ON "TestCase"("testerId");
          ALTER TABLE "TestCase" 
          ADD CONSTRAINT "TestCase_testerId_fkey" 
          FOREIGN KEY ("testerId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL;
        END IF;
      END $$;

      -- Email verification and user administration columns
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN DEFAULT false;
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verificationCodeHash" TEXT;
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verificationCodeExpiresAt" TIMESTAMP(3);
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verificationAttempts" INTEGER DEFAULT 0;
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "verificationLastSentAt" TIMESTAMP(3);
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'Active';
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeen" TIMESTAMP(3);

      -- Preserve existing accounts: mark existing users with null/no verificationCodeHash as verified and active
      UPDATE "User" 
      SET "emailVerified" = true 
      WHERE "verificationCodeHash" IS NULL AND ("emailVerified" IS NULL OR "emailVerified" = false);

      UPDATE "User" 
      SET "status" = 'Active' 
      WHERE "status" IS NULL;
    `);
    console.log('[DB] Schema verified successfully.');
  } catch (err) {
    console.error('[DB] Schema verification error (non-fatal):', err.message);
  }
}

ensureSchema();

module.exports = prisma;
module.exports.prisma = prisma;
module.exports.ensureSchema = ensureSchema;
