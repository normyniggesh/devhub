const bcrypt = require('bcryptjs');
const { DEFAULT_PERSONAL_STORAGE_BYTES } = require('../constants/storage');

/**
 * Authoritative Clean DEVHUB Data Reset
 *
 * Rules:
 * - Keeps ONLY admin@devhub.test (role = 'Admin', status = 'Active', emailVerified = true)
 * - Preserves Admin's Google Drive / System Storage UserIntegration
 * - Deletes ALL demo/test accounts (e.g. umer@gmail.com, paarth@devhub.test, etc.)
 * - Deletes ALL demo projects, project memberships, tasks, QA/test data, bugs,
 *   files, folders, calendar events, notifications, repositories, deployments,
 *   pull requests, teams, team memberships, team storage allocations, and old project storage allocations.
 * - Ensures Admin has an initial PersonalStorageAllocation of 5 GB (DEFAULT_PERSONAL_STORAGE_BYTES).
 */
async function performCleanReset(dbPool) {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    // 1. Ensure admin@devhub.test exists with password 123456 and role Admin
    const defaultPasswordHash = bcrypt.hashSync('123456', 10);
    const adminCheck = await client.query(`SELECT id, email, role, status FROM "User" WHERE LOWER(email) = 'admin@devhub.test'`);
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

    // 2. Identify demo users to be deleted
    const usersToDelete = await client.query(`
      SELECT id, email, name, role FROM "User" WHERE id != $1
    `, [adminId]);

    // 3. Delete demo data in dependency order
    const delPullRequests = await client.query(`DELETE FROM "PullRequest"`);
    const delDeployments = await client.query(`DELETE FROM "Deployment"`);
    const delRepositories = await client.query(`DELETE FROM "Repository"`);
    const delTestResults = await client.query(`DELETE FROM "TestResult"`);
    const delTestRuns = await client.query(`DELETE FROM "TestRun"`);
    const delBugs = await client.query(`DELETE FROM "Bug"`);
    const delTestCases = await client.query(`DELETE FROM "TestCase"`);
    const delTasks = await client.query(`DELETE FROM "Task"`);
    const delMilestones = await client.query(`DELETE FROM "Milestone"`);
    const delCalendarEvents = await client.query(`DELETE FROM "CalendarEvent"`);
    const delFiles = await client.query(`DELETE FROM "File"`);
    const delFolders = await client.query(`DELETE FROM "Folder"`);

    // Safely clean Team records and obsolete StorageAllocation if tables exist
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'TeamStorageAllocation') THEN
          DELETE FROM "TeamStorageAllocation";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'TeamMember') THEN
          DELETE FROM "TeamMember";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Team') THEN
          DELETE FROM "Team";
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'StorageAllocation') THEN
          DELETE FROM "StorageAllocation";
        END IF;
      END $$;
    `);

    const delProjectMembers = await client.query(`DELETE FROM "ProjectMember"`);
    const delProjects = await client.query(`DELETE FROM "Project"`);
    const delActivityInvolvements = await client.query(`DELETE FROM "ActivityInvolvement"`);
    const delCollegeActivities = await client.query(`DELETE FROM "CollegeActivity"`);
    const delNotifications = await client.query(`DELETE FROM "Notification"`);

    // Clean demo audit logs (preserve system integration audit records if any)
    const delAuditLogs = await client.query(`DELETE FROM "AuditLog" WHERE "entityType" != 'Integration' OR "userId" != $1`, [adminId]);

    // PRESERVE Admin's Google Drive integration; delete any non-admin integrations
    const delNonAdminIntegrations = await client.query(`
      DELETE FROM "UserIntegration" WHERE "userId" != $1
    `, [adminId]);

    // Delete non-admin demo users
    const delUsers = await client.query(`
      DELETE FROM "User" WHERE id != $1
    `, [adminId]);

    // 4. Ensure PersonalStorageAllocation table exists and Admin has 5 GB
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

    // Clean any old personal allocations for deleted users
    await client.query(`DELETE FROM "PersonalStorageAllocation" WHERE "userId" != $1`, [adminId]);

    await client.query(`
      INSERT INTO "PersonalStorageAllocation" ("id", "userId", "allocatedBytes", "usedBytes", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, 0, NOW(), NOW())
      ON CONFLICT ("userId") DO UPDATE
      SET "allocatedBytes" = $2, "updatedAt" = NOW();
    `, [adminId, DEFAULT_PERSONAL_STORAGE_BYTES.toString()]);

    await client.query('COMMIT');

    // 5. Verification checks
    const remainingUsers = await client.query(`SELECT id, email, role, status, "emailVerified" FROM "User"`);
    const adminIntegrations = await client.query(`
      SELECT id, provider, status, "accountName", metadata->>'isSystemStorage' as "isSystemStorage"
      FROM "UserIntegration" WHERE "userId" = $1
    `, [adminId]);

    return {
      success: true,
      deletedDemoUsers: usersToDelete.rows,
      deletedCounts: {
        users: delUsers.rowCount,
        projects: delProjects.rowCount,
        projectMembers: delProjectMembers.rowCount,
        tasks: delTasks.rowCount,
        testCases: delTestCases.rowCount,
        testRuns: delTestRuns.rowCount,
        testResults: delTestResults.rowCount,
        bugs: delBugs.rowCount,
        calendarEvents: delCalendarEvents.rowCount,
        files: delFiles.rowCount,
        folders: delFolders.rowCount,
        oldStorageAllocations: 0,
        repositories: delRepositories.rowCount,
        pullRequests: delPullRequests.rowCount,
        deployments: delDeployments.rowCount,
        notifications: delNotifications.rowCount,
        auditLogs: delAuditLogs.rowCount,
        nonAdminIntegrations: delNonAdminIntegrations.rowCount
      },
      remainingUserCount: remainingUsers.rowCount,
      remainingUsers: remainingUsers.rows,
      adminUser: remainingUsers.rows[0],
      adminIntegrations: adminIntegrations.rows,
      isSoleAdmin: remainingUsers.rowCount === 1 && remainingUsers.rows[0].email === 'admin@devhub.test'
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[CleanReset] Error during data reset:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  performCleanReset
};
