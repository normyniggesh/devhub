const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

let poolConfig = { connectionString: process.env.DATABASE_URL };
if (process.env.DATABASE_URL) {
  try {
    const parsed = new URL(process.env.DATABASE_URL);
    poolConfig = {
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 5432,
      database: parsed.pathname.replace(/^\//, ''),
      ssl: (parsed.searchParams.get('sslmode') === 'require' || parsed.hostname.includes('neon.tech') || parsed.hostname.includes('render.com')) ? { rejectUnauthorized: false } : undefined
    };
  } catch (_) {
    poolConfig = { connectionString: process.env.DATABASE_URL };
  }
}

const pool = new Pool(poolConfig);
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Ensure BigInt values serialize cleanly to JSON numbers across all Express res.json() calls
if (!BigInt.prototype.toJSON) {
  BigInt.prototype.toJSON = function () {
    const n = Number(this);
    return Number.isSafeInteger(n) ? n : this.toString();
  };
}

// Automatically ensure schema columns exist on connected PostgreSQL (Neon / Production)
let schemaPromise = null;
function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
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

      -- Google Drive Storage migration preparation
      ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "storageProvider" TEXT DEFAULT 's3';
      ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "driveFileId" TEXT;
      ALTER TABLE "File" ALTER COLUMN "size" TYPE BIGINT;
      ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "driveFolderId" TEXT;
      ALTER TABLE "Folder" ADD COLUMN IF NOT EXISTS "driveFolderId" TEXT;

      -- Ensure existing File records remain 's3'
      UPDATE "File" 
      SET "storageProvider" = 's3' 
      WHERE "storageProvider" IS NULL;

      -- New User/Team/Storage Foundation (Phase 3)
      CREATE TABLE IF NOT EXISTS "Team" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" TEXT NOT NULL,
        "description" TEXT,
        "createdById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON UPDATE CASCADE ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS "Team_createdById_idx" ON "Team"("createdById");

      CREATE TABLE IF NOT EXISTS "TeamMember" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        "teamId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'Member',
        "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON UPDATE CASCADE ON DELETE CASCADE,
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT "TeamMember_teamId_userId_key" UNIQUE ("teamId", "userId")
      );
      CREATE INDEX IF NOT EXISTS "TeamMember_teamId_idx" ON "TeamMember"("teamId");
      CREATE INDEX IF NOT EXISTS "TeamMember_userId_idx" ON "TeamMember"("userId");

      CREATE TABLE IF NOT EXISTS "PersonalStorageAllocation" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" TEXT NOT NULL UNIQUE,
        "allocatedBytes" BIGINT NOT NULL DEFAULT 5368709120,
        "usedBytes" BIGINT NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "PersonalStorageAllocation_userId_idx" ON "PersonalStorageAllocation"("userId");

      CREATE TABLE IF NOT EXISTS "TeamStorageAllocation" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        "teamId" TEXT NOT NULL UNIQUE,
        "allocatedBytes" BIGINT NOT NULL DEFAULT 10737418240,
        "usedBytes" BIGINT NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON UPDATE CASCADE ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "TeamStorageAllocation_teamId_idx" ON "TeamStorageAllocation"("teamId");

      -- Scope and Team relationship on File & Folder
      ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "storageScope" TEXT NOT NULL DEFAULT 'PERSONAL';
      ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
      ALTER TABLE "File" ALTER COLUMN "projectId" DROP NOT NULL;
      CREATE INDEX IF NOT EXISTS "File_storageScope_idx" ON "File"("storageScope");
      CREATE INDEX IF NOT EXISTS "File_teamId_idx" ON "File"("teamId");
      CREATE INDEX IF NOT EXISTS "File_uploaderId_idx" ON "File"("uploaderId");

      ALTER TABLE "Folder" ADD COLUMN IF NOT EXISTS "storageScope" TEXT NOT NULL DEFAULT 'PERSONAL';
      ALTER TABLE "Folder" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
      ALTER TABLE "Folder" ALTER COLUMN "projectId" DROP NOT NULL;
      CREATE INDEX IF NOT EXISTS "Folder_storageScope_idx" ON "Folder"("storageScope");
      CREATE INDEX IF NOT EXISTS "Folder_teamId_idx" ON "Folder"("teamId");
      CREATE INDEX IF NOT EXISTS "Folder_creatorId_idx" ON "Folder"("creatorId");

      -- Drop obsolete project-based StorageAllocation table
      DROP TABLE IF EXISTS "StorageAllocation";
    `);
    console.log('[DB] Schema verified successfully.');

    // Bootstrap single admin account (no demo accounts created)
    await bootstrapAdminAccount(pool);
    } catch (err) {
      console.error('[DB] Schema verification error (non-fatal):', err.message);
    }
  })();
  return schemaPromise;
}

async function bootstrapAdminAccount(dbPool) {
  const p = dbPool || pool;
  if (!p) return;
  const bcrypt = require('bcryptjs');
  const { DEFAULT_PERSONAL_STORAGE_BYTES } = require('../constants/storage');
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const defaultPasswordHash = bcrypt.hashSync('123456', 10);

    // 1. Ensure admin@devhub.test exists with password 123456 and role Admin
    const adminCheck = await client.query(`SELECT id FROM "User" WHERE LOWER(email) = 'admin@devhub.test'`);
    let adminId;
    if (adminCheck.rows.length > 0) {
      adminId = adminCheck.rows[0].id;
      await client.query(`
        UPDATE "User"
        SET name = 'Admin',
            "passwordHash" = $1,
            role = 'Admin',
            "emailVerified" = true,
            status = 'Active',
            "verificationCodeHash" = NULL,
            "verificationCodeExpiresAt" = NULL,
            "verificationAttempts" = 0,
            "updatedAt" = NOW()
        WHERE id = $2
      `, [defaultPasswordHash, adminId]);
    } else {
      const newAdmin = await client.query(`
        INSERT INTO "User" (
          id, name, email, "passwordHash", role, "emailVerified", status, "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), 'Admin', 'admin@devhub.test', $1, 'Admin', true, 'Active', NOW(), NOW()
        ) RETURNING id
      `, [defaultPasswordHash]);
      adminId = newAdmin.rows[0].id;
    }

    // 2. Ensure admin@devhub.test is the ONLY admin account (demote any other admin to User)
    await client.query(`
      UPDATE "User"
      SET role = 'User'
      WHERE id != $1 AND role = 'Admin'
    `, [adminId]);

    // 3. Ensure PersonalStorageAllocation table exists and Admin has 5 GB
    await client.query(`
      CREATE TABLE IF NOT EXISTS "PersonalStorageAllocation" (
        "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" TEXT NOT NULL UNIQUE,
        "allocatedBytes" BIGINT NOT NULL DEFAULT ${DEFAULT_PERSONAL_STORAGE_BYTES.toString()},
        "usedBytes" BIGINT NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
      );
    `);

    await client.query(`
      INSERT INTO "PersonalStorageAllocation" ("id", "userId", "allocatedBytes", "usedBytes", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, 0, NOW(), NOW())
      ON CONFLICT ("userId") DO UPDATE
      SET "updatedAt" = NOW();
    `, [adminId, DEFAULT_PERSONAL_STORAGE_BYTES.toString()]);

    await client.query('COMMIT');
    console.log('[DB] Bootstrap complete: admin@devhub.test is sole Admin with 5 GB personal storage.');
    return {
      success: true,
      adminId
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DB] Account synchronization error (non-fatal):', err.message);
    throw err;
  } finally {
    client.release();
  }
}

ensureSchema();

module.exports = prisma;
module.exports.prisma = prisma;
module.exports.pool = pool;
module.exports.ensureSchema = ensureSchema;
module.exports.bootstrapAdminAccount = bootstrapAdminAccount;
module.exports.syncProductionAccounts = bootstrapAdminAccount; // Backwards compatible alias


