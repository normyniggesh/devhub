const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
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

      -- Google Drive Storage migration preparation (Step 2)
      ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "storageProvider" TEXT DEFAULT 's3';
      ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "driveFileId" TEXT;
      ALTER TABLE "File" ALTER COLUMN "size" TYPE BIGINT;
      ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "driveFolderId" TEXT;
      ALTER TABLE "Folder" ADD COLUMN IF NOT EXISTS "driveFolderId" TEXT;

      -- Ensure existing File records remain 's3'
      UPDATE "File" 
      SET "storageProvider" = 's3' 
      WHERE "storageProvider" IS NULL;
    `);
    console.log('[DB] Schema verified successfully.');

    // Bootstrap single admin and preserve umer and paarth accounts
    await syncProductionAccounts(pool);
  } catch (err) {
    console.error('[DB] Schema verification error (non-fatal):', err.message);
  }
}

async function syncProductionAccounts(dbPool) {
  const p = dbPool || pool;
  if (!p) return;
  const bcrypt = require('bcryptjs');
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

    // 2. Ensure umer@gmail.com exists (preserve password if set, or 123456, role: User)
    const umerCheck = await client.query(`
      SELECT id, "passwordHash" FROM "User"
      WHERE LOWER(email) = 'umer@gmail.com' OR LOWER(email) LIKE 'umer@g%'
      ORDER BY "createdAt" ASC LIMIT 1
    `);
    let umerId;
    if (umerCheck.rows.length > 0) {
      umerId = umerCheck.rows[0].id;
      const passHash = umerCheck.rows[0].passwordHash || defaultPasswordHash;
      await client.query(`
        UPDATE "User"
        SET email = 'umer@gmail.com',
            name = COALESCE(name, 'Umer'),
            "passwordHash" = $1,
            role = 'User',
            "emailVerified" = true,
            status = 'Active',
            "verificationCodeHash" = NULL,
            "verificationCodeExpiresAt" = NULL,
            "verificationAttempts" = 0,
            "updatedAt" = NOW()
        WHERE id = $2
      `, [passHash, umerId]);
    } else {
      const altUmer = await client.query(`
        SELECT id, "passwordHash" FROM "User"
        WHERE LOWER(email) LIKE 'umer@%' AND id != $1
        ORDER BY "createdAt" ASC LIMIT 1
      `, [adminId]);
      if (altUmer.rows.length > 0) {
        umerId = altUmer.rows[0].id;
        const passHash = altUmer.rows[0].passwordHash || defaultPasswordHash;
        await client.query(`
          UPDATE "User"
          SET email = 'umer@gmail.com',
              name = 'Umer',
              "passwordHash" = $1,
              role = 'User',
              "emailVerified" = true,
              status = 'Active',
              "verificationCodeHash" = NULL,
              "verificationCodeExpiresAt" = NULL,
              "verificationAttempts" = 0,
              "updatedAt" = NOW()
          WHERE id = $2
        `, [passHash, umerId]);
      } else {
        const newUmer = await client.query(`
          INSERT INTO "User" (
            id, name, email, "passwordHash", role, "emailVerified", status, "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid(), 'Umer', 'umer@gmail.com', $1, 'User', true, 'Active', NOW(), NOW()
          ) RETURNING id
        `, [defaultPasswordHash]);
        umerId = newUmer.rows[0].id;
      }
    }

    // 3. Ensure Paarth exists (preserve password if set, or 123456, role: User)
    const paarthCheck = await client.query(`
      SELECT id, email, "passwordHash" FROM "User"
      WHERE LOWER(email) LIKE '%paarth%'
      ORDER BY "createdAt" ASC LIMIT 1
    `);
    let paarthId;
    let paarthEmail = 'paarth@devhub.test';
    if (paarthCheck.rows.length > 0) {
      paarthId = paarthCheck.rows[0].id;
      paarthEmail = paarthCheck.rows[0].email;
      const passHash = paarthCheck.rows[0].passwordHash || defaultPasswordHash;
      await client.query(`
        UPDATE "User"
        SET "passwordHash" = $1,
            role = 'User',
            "emailVerified" = true,
            status = 'Active',
            "verificationCodeHash" = NULL,
            "verificationCodeExpiresAt" = NULL,
            "verificationAttempts" = 0,
            "updatedAt" = NOW()
        WHERE id = $2
      `, [passHash, paarthId]);
    } else {
      const newPaarth = await client.query(`
        INSERT INTO "User" (
          id, name, email, "passwordHash", role, "emailVerified", status, "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), 'Paarth', 'paarth@devhub.test', $1, 'User', true, 'Active', NOW(), NOW()
        ) RETURNING id
      `, [defaultPasswordHash]);
      paarthId = newPaarth.rows[0].id;
      paarthEmail = 'paarth@devhub.test';
    }

    // 4. Ensure admin@devhub.test is the ONLY admin account (demote any other admin to User)
    await client.query(`
      UPDATE "User"
      SET role = 'User'
      WHERE id != $1 AND role = 'Admin'
    `, [adminId]);

    // 5. Reassign projects belonging to Umer
    await client.query(`
      UPDATE "Project"
      SET "ownerId" = $1
      WHERE ("ownerId" = $2 OR LOWER(name) LIKE '%umer%' OR LOWER(name) LIKE '%demo%')
        AND LOWER(name) NOT LIKE '%google drive%'
    `, [umerId, adminId]);

    // 6. Reassign any orphaned records from other accounts before removing them
    const otherUsers = await client.query(`
      SELECT id, email FROM "User"
      WHERE id NOT IN ($1, $2, $3)
    `, [adminId, umerId, paarthId]);

    for (const u of otherUsers.rows) {
      const isUmerAlias = u.email && u.email.toLowerCase().startsWith('umer');
      const targetUserId = isUmerAlias ? umerId : adminId;

      await client.query(`UPDATE "Project" SET "ownerId" = $1 WHERE "ownerId" = $2`, [targetUserId, u.id]);
      await client.query(`UPDATE "File" SET "uploaderId" = $1 WHERE "uploaderId" = $2`, [targetUserId, u.id]);
      await client.query(`UPDATE "Folder" SET "creatorId" = $1 WHERE "creatorId" = $2`, [targetUserId, u.id]);
      await client.query(`UPDATE "Task" SET "creatorId" = $1 WHERE "creatorId" = $2`, [targetUserId, u.id]);
      await client.query(`UPDATE "Task" SET "assigneeId" = $1 WHERE "assigneeId" = $2`, [targetUserId, u.id]);
      await client.query(`UPDATE "TestCase" SET "creatorId" = $1 WHERE "creatorId" = $2`, [targetUserId, u.id]);
      await client.query(`UPDATE "TestCase" SET "assigneeId" = NULL WHERE "assigneeId" = $1`, [u.id]);
      await client.query(`UPDATE "TestCase" SET "testerId" = NULL WHERE "testerId" = $1`, [u.id]);
      await client.query(`UPDATE "TestRun" SET "executorId" = NULL WHERE "executorId" = $1`, [u.id]);
      await client.query(`UPDATE "TestResult" SET "executorId" = NULL WHERE "executorId" = $1`, [u.id]);
      await client.query(`UPDATE "Bug" SET "creatorId" = $1 WHERE "creatorId" = $2`, [targetUserId, u.id]);
      await client.query(`UPDATE "Bug" SET "assigneeId" = NULL WHERE "assigneeId" = $1`, [u.id]);
      await client.query(`UPDATE "CalendarEvent" SET "creatorId" = $1 WHERE "creatorId" = $2`, [targetUserId, u.id]);
      await client.query(`UPDATE "Milestone" SET "creatorId" = $1 WHERE "creatorId" = $2`, [targetUserId, u.id]);
      await client.query(`UPDATE "Repository" SET "userId" = $1 WHERE "userId" = $2`, [targetUserId, u.id]);

      await client.query(`DELETE FROM "ProjectMember" WHERE "userId" = $1`, [u.id]);
      await client.query(`DELETE FROM "UserIntegration" WHERE "userId" = $1`, [u.id]);
      await client.query(`DELETE FROM "Notification" WHERE "userId" = $1`, [u.id]);
      await client.query(`DELETE FROM "AuditLog" WHERE "userId" = $1`, [u.id]);
      await client.query(`DELETE FROM "ActivityInvolvement" WHERE "userId" = $1`, [u.id]);

      await client.query(`DELETE FROM "User" WHERE id = $1`, [u.id]);
    }

    // 7. Map Google Drive integration to Admin
    const gdriveInteg = await client.query(`SELECT id FROM "UserIntegration" WHERE provider = 'google_drive'`);
    if (gdriveInteg.rows.length > 0) {
      await client.query(`UPDATE "UserIntegration" SET "userId" = $1 WHERE id = $2`, [adminId, gdriveInteg.rows[0].id]);
    }

    // 8. Ensure project memberships for collaboration
    const allProjects = await client.query(`SELECT id, name FROM "Project"`);
    for (const proj of allProjects.rows) {
      if (proj.name.toLowerCase().includes('shared') || proj.name.toLowerCase().includes('qa')) {
        await client.query(`
          INSERT INTO "ProjectMember" (id, "projectId", "userId", role, "joinedAt")
          VALUES (gen_random_uuid(), $1, $2, 'Editor', NOW())
          ON CONFLICT ("projectId", "userId") DO NOTHING
        `, [proj.id, paarthId]);
      }
      await client.query(`
        INSERT INTO "ProjectMember" (id, "projectId", "userId", role, "joinedAt")
        VALUES (gen_random_uuid(), $1, $2, 'Owner', NOW())
        ON CONFLICT ("projectId", "userId") DO NOTHING
      `, [proj.id, adminId]);
    }

    await client.query('COMMIT');
    console.log('[DB] Account synchronization complete: admin@devhub.test is sole Admin; umer@gmail.com and paarth preserved.');
    return {
      success: true,
      adminId,
      umerId,
      paarthId,
      paarthEmail
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
module.exports.syncProductionAccounts = syncProductionAccounts;

