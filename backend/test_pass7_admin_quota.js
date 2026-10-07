require('dotenv').config();
const prisma = require('./src/db');
const crypto = require('crypto');
const adminController = require('./src/controllers/admin');
const adminQuotasController = require('./src/controllers/adminQuotas');
const storageQuotaService = require('./src/services/storageQuotaService');
const storagePoolService = require('./src/services/storagePoolService');
const adminMiddleware = require('./src/middleware/admin');
const {
  DEFAULT_PERSONAL_STORAGE_BYTES,
  DEFAULT_TEAM_STORAGE_BYTES,
  GLOBAL_PHYSICAL_CAPACITY_BYTES,
  GLOBAL_SAFETY_BUFFER_BYTES
} = require('./src/constants/storage');

// ANSI formatting
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';

let passedTests = 0;
let totalTests = 0;

function report(testNumber, passed, description) {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  ${GREEN}✓ PASS:${RESET} [Test ${testNumber}] ${description}`);
  } else {
    console.error(`  ${RED}✗ FAIL:${RESET} [Test ${testNumber}] ${description}`);
  }
}

// In-Memory Google Drive & S3 Tracking
const mockDriveState = {
  driveCallCount: 0,
  s3CallsCount: 0
};

function setupMockNetwork() {
  const origFetch = global.fetch;

  global.fetch = async (url, options = {}) => {
    const urlStr = String(url);

    // Track if any S3 network calls happen
    if (urlStr.includes('s3.amazonaws.com') || urlStr.includes('amazonaws.com')) {
      mockDriveState.s3CallsCount++;
      return new Response(null, { status: 500, statusText: 'S3 should not be called' });
    }

    // Track if any Google Drive API calls happen
    if (urlStr.includes('googleapis.com')) {
      mockDriveState.driveCallCount++;
      return new Response(JSON.stringify({ id: 'mock_drive_id' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (origFetch) {
      return origFetch(url, options);
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };
}

function createMockReqRes({ userId = null, params = {}, body = {}, query = {}, user = null } = {}) {
  const req = {
    userId,
    params,
    body,
    query,
    user,
    adminUser: user
  };
  let statusCode = 200;
  let responseData = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    getStatusCode() {
      return statusCode;
    },
    getData() {
      return responseData;
    }
  };
  return { req, res };
}

async function runPass7TestSuite() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   DEVHUB PASS 7 — ADMIN STORAGE & USER/TEAM QUOTA TEST SUITE   ${RESET}`);
  console.log(`${CYAN}================================================================\n${RESET}`);

  setupMockNetwork();

  let adminUser, teamLeaderUser, regularUser;
  let testTeam;
  let initialDriveCalls = mockDriveState.driveCallCount;

  try {
    const rand = crypto.randomBytes(4).toString('hex');
    const adminEmail = `admin_p7_${rand}@devhub.local`;
    const leaderEmail = `leader_p7_${rand}@devhub.local`;
    const userEmail = `user_p7_${rand}@devhub.local`;

    // 1. Create Test Users
    adminUser = await prisma.user.create({
      data: {
        name: 'Pass 7 Admin',
        email: adminEmail,
        passwordHash: 'hashed_pw_test',
        role: 'Admin',
        status: 'Active',
        emailVerified: true
      }
    });

    teamLeaderUser = await prisma.user.create({
      data: {
        name: 'Pass 7 Team Leader',
        email: leaderEmail,
        passwordHash: 'hashed_pw_test',
        role: 'User',
        status: 'Active',
        emailVerified: true
      }
    });

    regularUser = await prisma.user.create({
      data: {
        name: 'Pass 7 Regular User',
        email: userEmail,
        passwordHash: 'hashed_pw_test',
        role: 'User',
        status: 'Active',
        emailVerified: true
      }
    });

    // 2. Create Test Team
    testTeam = await prisma.team.create({
      data: {
        name: `Pass 7 Test Team ${rand}`,
        description: 'Isolated team for quota verification',
        createdById: teamLeaderUser.id,
        members: {
          create: [
            { userId: teamLeaderUser.id, role: 'Leader' },
            { userId: regularUser.id, role: 'Member' }
          ]
        }
      }
    });

    // Initialize allocations using authoritative service
    const initialUserQuota = await storageQuotaService.getPersonalQuota(regularUser.id);
    const initialTeamQuota = await storageQuotaService.getTeamQuota(testTeam.id);

    console.log(`  Initialized allocations: User = ${initialUserQuota.allocatedGB} GB, Team = ${initialTeamQuota.allocatedGB} GB\n`);

    // -----------------------------------------------------------------
    // TEST 1: Admin can list users with full storage details
    // -----------------------------------------------------------------
    {
      const { req, res } = createMockReqRes({ userId: adminUser.id, user: adminUser });
      await adminController.getUsers(req, res);
      const data = res.getData();
      const foundUser = data.users?.find((u) => u.id === regularUser.id);

      const pass = res.getStatusCode() === 200 &&
        data.success === true &&
        Array.isArray(data.users) &&
        foundUser !== undefined &&
        foundUser.storage !== undefined &&
        foundUser.storage.allocatedGB === 5 &&
        foundUser.storage.usedGB === '0.000' &&
        foundUser.storage.remainingGB === '5.000' &&
        foundUser.storage.percentage === 0;

      report(1, pass, 'Admin can list users with name, email, role, status, allocated, used, remaining, %');
    }

    // -----------------------------------------------------------------
    // TEST 2: Admin can list teams with leader and storage breakdown
    // -----------------------------------------------------------------
    {
      const { req, res } = createMockReqRes({ userId: adminUser.id, user: adminUser });
      await adminController.getTeams(req, res);
      const data = res.getData();
      const foundTeam = data.teams?.find((t) => t.id === testTeam.id);

      const pass = res.getStatusCode() === 200 &&
        data.success === true &&
        Array.isArray(data.teams) &&
        foundTeam !== undefined &&
        foundTeam.leader?.email === leaderEmail &&
        foundTeam.memberCount === 2 &&
        foundTeam.storage !== undefined &&
        foundTeam.storage.allocatedGB === 10 &&
        foundTeam.storage.usedGB === '0.000' &&
        foundTeam.storage.remainingGB === '10.000' &&
        foundTeam.storage.percentage === 0;

      report(2, pass, 'Admin can list teams showing leader, member count, allocated, used, remaining, %');
    }

    // -----------------------------------------------------------------
    // TEST 3: Admin can read user storage details
    // -----------------------------------------------------------------
    {
      const { req, res } = createMockReqRes({
        userId: adminUser.id,
        user: adminUser,
        params: { userId: regularUser.id }
      });
      await adminQuotasController.getUserQuota(req, res);
      const data = res.getData();

      const pass = res.getStatusCode() === 200 &&
        data.success === true &&
        data.quota?.userId === regularUser.id &&
        data.quota?.allocatedGB === 5 &&
        data.quota?.usedBytes === '0';

      report(3, pass, 'Admin can read specific user storage details via /admin/quotas/user/:userId');
    }

    // -----------------------------------------------------------------
    // TEST 4: Admin can read team storage details
    // -----------------------------------------------------------------
    {
      const { req, res } = createMockReqRes({
        userId: adminUser.id,
        user: adminUser,
        params: { teamId: testTeam.id }
      });
      await adminQuotasController.getTeamQuota(req, res);
      const data = res.getData();

      const pass = res.getStatusCode() === 200 &&
        data.success === true &&
        data.quota?.teamId === testTeam.id &&
        data.quota?.allocatedGB === 10 &&
        data.quota?.usedBytes === '0';

      report(4, pass, 'Admin can read specific team storage details via /admin/quotas/team/:teamId');
    }

    // -----------------------------------------------------------------
    // TEST 5: Admin can increase user quota (5 GB -> 8 GB)
    // -----------------------------------------------------------------
    {
      const { req, res } = createMockReqRes({
        userId: adminUser.id,
        user: adminUser,
        body: { userId: regularUser.id, allocatedGB: 8 }
      });
      await adminQuotasController.setUserQuota(req, res);
      const data = res.getData();

      const expectedBytes = (8n * 1024n * 1024n * 1024n).toString();
      const pass = res.getStatusCode() === 200 &&
        data.success === true &&
        data.quota?.allocatedBytes === expectedBytes &&
        data.quota?.allocatedGB === 8;

      report(5, pass, 'Admin can increase personal storage allocation (5 GB -> 8 GB)');
    }

    // -----------------------------------------------------------------
    // TEST 6: Admin can decrease user quota when still >= usedBytes (8 GB -> 6 GB)
    // -----------------------------------------------------------------
    {
      const { req, res } = createMockReqRes({
        userId: adminUser.id,
        user: adminUser,
        body: { userId: regularUser.id, allocatedGB: 6 }
      });
      await adminQuotasController.setUserQuota(req, res);
      const data = res.getData();

      const expectedBytes = (6n * 1024n * 1024n * 1024n).toString();
      const pass = res.getStatusCode() === 200 &&
        data.success === true &&
        data.quota?.allocatedBytes === expectedBytes &&
        data.quota?.allocatedGB === 6;

      report(6, pass, 'Admin can decrease personal storage allocation when >= usedBytes (8 GB -> 6 GB)');
    }

    // -----------------------------------------------------------------
    // TEST 7: Quota decrease below usedBytes is rejected
    // -----------------------------------------------------------------
    {
      // Simulate 3 GB of used personal storage
      const used3GB = 3n * 1024n * 1024n * 1024n;
      await prisma.personalStorageAllocation.update({
        where: { userId: regularUser.id },
        data: { usedBytes: used3GB }
      });

      // Try setting allocation to 2 GB
      const { req, res } = createMockReqRes({
        userId: adminUser.id,
        user: adminUser,
        body: { userId: regularUser.id, allocatedGB: 2 }
      });
      await adminQuotasController.setUserQuota(req, res);
      const data = res.getData();

      // Check current quota in DB remains 6 GB
      const currentQuota = await storageQuotaService.getPersonalQuota(regularUser.id);

      const pass = res.getStatusCode() === 400 &&
        data.success === false &&
        data.message.includes('Allocation cannot be lower than current usage') &&
        currentQuota.allocatedGB === 6;

      report(7, pass, 'Quota decrease below usedBytes is rejected (attempting 2 GB when used is 3 GB)');

      // Clean up simulated usage
      await prisma.personalStorageAllocation.update({
        where: { userId: regularUser.id },
        data: { usedBytes: 0n }
      });
    }

    // -----------------------------------------------------------------
    // TEST 8: Admin can increase team quota (10 GB -> 15 GB)
    // -----------------------------------------------------------------
    {
      const { req, res } = createMockReqRes({
        userId: adminUser.id,
        user: adminUser,
        body: { teamId: testTeam.id, allocatedGB: 15 }
      });
      await adminQuotasController.setTeamQuota(req, res);
      const data = res.getData();

      const expectedBytes = (15n * 1024n * 1024n * 1024n).toString();
      const pass = res.getStatusCode() === 200 &&
        data.success === true &&
        data.quota?.allocatedBytes === expectedBytes &&
        data.quota?.allocatedGB === 15;

      report(8, pass, 'Admin can increase team storage allocation (10 GB -> 15 GB)');
    }

    // -----------------------------------------------------------------
    // TEST 9: Team quota below usedBytes is rejected
    // -----------------------------------------------------------------
    {
      // Simulate 5 GB of used team storage
      const used5GB = 5n * 1024n * 1024n * 1024n;
      await prisma.teamStorageAllocation.update({
        where: { teamId: testTeam.id },
        data: { usedBytes: used5GB }
      });

      // Try setting team allocation to 4 GB
      const { req, res } = createMockReqRes({
        userId: adminUser.id,
        user: adminUser,
        body: { teamId: testTeam.id, allocatedGB: 4 }
      });
      await adminQuotasController.setTeamQuota(req, res);
      const data = res.getData();

      const currentTeamQuota = await storageQuotaService.getTeamQuota(testTeam.id);

      const pass = res.getStatusCode() === 400 &&
        data.success === false &&
        data.message.includes('Allocation cannot be lower than current usage') &&
        currentTeamQuota.allocatedGB === 15;

      report(9, pass, 'Team quota decrease below usedBytes is rejected (attempting 4 GB when used is 5 GB)');

      // Clean up simulated usage
      await prisma.teamStorageAllocation.update({
        where: { teamId: testTeam.id },
        data: { usedBytes: 0n }
      });
    }

    // -----------------------------------------------------------------
    // TEST 10: Team Leader cannot change team quota (adminMiddleware blocks with 403)
    // -----------------------------------------------------------------
    {
      const { req, res } = createMockReqRes({
        userId: teamLeaderUser.id,
        user: teamLeaderUser,
        body: { teamId: testTeam.id, allocatedGB: 25 }
      });

      let nextCalled = false;
      await adminMiddleware(req, res, () => { nextCalled = true; });

      const pass = res.getStatusCode() === 403 &&
        nextCalled === false &&
        res.getData()?.error?.includes('Admin access required');

      report(10, pass, 'Team Leader cannot change quota (receives 403 Forbidden from adminMiddleware)');
    }

    // -----------------------------------------------------------------
    // TEST 11: Normal User cannot change personal quota (adminMiddleware blocks with 403)
    // -----------------------------------------------------------------
    {
      const { req, res } = createMockReqRes({
        userId: regularUser.id,
        user: regularUser,
        body: { userId: regularUser.id, allocatedGB: 20 }
      });

      let nextCalled = false;
      await adminMiddleware(req, res, () => { nextCalled = true; });

      const pass = res.getStatusCode() === 403 &&
        nextCalled === false &&
        res.getData()?.error?.includes('Admin access required');

      report(11, pass, 'Normal User cannot change quota (receives 403 Forbidden from adminMiddleware)');
    }

    // -----------------------------------------------------------------
    // TEST 12: Audit records created for user and team quota modifications
    // -----------------------------------------------------------------
    {
      const userAudit = await prisma.auditLog.findFirst({
        where: {
          entityType: 'PersonalStorageAllocation',
          entityId: regularUser.id,
          userId: adminUser.id
        },
        orderBy: { createdAt: 'desc' }
      });

      const teamAudit = await prisma.auditLog.findFirst({
        where: {
          entityType: 'TeamStorageAllocation',
          entityId: testTeam.id,
          userId: adminUser.id
        },
        orderBy: { createdAt: 'desc' }
      });

      const pass = userAudit !== null &&
        teamAudit !== null &&
        userAudit.metadata?.actionType === 'user_quota_change' &&
        userAudit.metadata?.newAllocatedGB === 6 &&
        teamAudit.metadata?.actionType === 'team_quota_change' &&
        teamAudit.metadata?.newAllocatedGB === 15;

      report(12, pass, 'Authoritative audit records created for both user and team quota updates');
    }

    // -----------------------------------------------------------------
    // TEST 13: Global storage monitoring metrics remain authoritative
    // -----------------------------------------------------------------
    {
      const poolStatus = await storagePoolService.getPoolStatus();

      const pass = poolStatus.physicalCapacityTB === 5 &&
        poolStatus.physicalCapacityGB === 5120 &&
        poolStatus.safetyBufferGB === 50 &&
        typeof poolStatus.actualUsedGB === 'string' &&
        typeof poolStatus.actualRemainingGB === 'string' &&
        typeof poolStatus.totalLogicalPersonalGB === 'string' &&
        typeof poolStatus.totalLogicalTeamGB === 'string' &&
        typeof poolStatus.allocatedGB === 'string' &&
        typeof poolStatus.userCount === 'number' &&
        typeof poolStatus.teamCount === 'number' &&
        Array.isArray(poolStatus.highestUsageUsers) &&
        Array.isArray(poolStatus.highestUsageTeams);

      report(13, pass, 'Global storage monitoring metrics correctly compute 5 TB pool, buffer, totals, and top consumers');
    }

    // -----------------------------------------------------------------
    // TEST 14: Google Drive files are untouched by quota changes
    // -----------------------------------------------------------------
    {
      // No Google Drive API calls should be triggered by quota changes
      const driveCallsDuringQuotas = mockDriveState.driveCallCount - initialDriveCalls;

      const pass = driveCallsDuringQuotas === 0;
      report(14, pass, 'Google Drive files are untouched by quota changes (zero Drive API operations)');
    }

    // -----------------------------------------------------------------
    // TEST 15: Zero S3 operations executed
    // -----------------------------------------------------------------
    {
      const pass = mockDriveState.s3CallsCount === 0;
      report(15, pass, 'Zero AWS S3 operations executed across entire test execution');
    }

    // -----------------------------------------------------------------
    // TEST 16: Invalid or negative allocations are rejected
    // -----------------------------------------------------------------
    {
      const { req: rNeg, res: resNeg } = createMockReqRes({
        userId: adminUser.id,
        user: adminUser,
        body: { userId: regularUser.id, allocatedGB: -5 }
      });
      await adminQuotasController.setUserQuota(rNeg, resNeg);

      const { req: rZero, res: resZero } = createMockReqRes({
        userId: adminUser.id,
        user: adminUser,
        body: { teamId: testTeam.id, allocatedGB: 0 }
      });
      await adminQuotasController.setTeamQuota(rZero, resZero);

      const pass = resNeg.getStatusCode() === 400 && resZero.getStatusCode() === 400;
      report(16, pass, 'Negative and zero allocations are rejected with status 400 Bad Request');
    }

  } catch (err) {
    console.error(`\n${RED}Unexpected exception during Pass 7 test suite:${RESET}`, err);
  } finally {
    // -----------------------------------------------------------------
    // Cleanup Isolated Test Records
    // -----------------------------------------------------------------
    console.log(`\n  Cleaning up isolated test resources...`);
    try {
      if (regularUser) {
        await prisma.personalStorageAllocation.deleteMany({ where: { userId: regularUser.id } }).catch(() => {});
      }
      if (teamLeaderUser) {
        await prisma.personalStorageAllocation.deleteMany({ where: { userId: teamLeaderUser.id } }).catch(() => {});
      }
      if (adminUser) {
        await prisma.personalStorageAllocation.deleteMany({ where: { userId: adminUser.id } }).catch(() => {});
      }
      if (testTeam) {
        await prisma.teamStorageAllocation.deleteMany({ where: { teamId: testTeam.id } }).catch(() => {});
        await prisma.teamMember.deleteMany({ where: { teamId: testTeam.id } }).catch(() => {});
        await prisma.team.deleteMany({ where: { id: testTeam.id } }).catch(() => {});
      }
      if (regularUser) {
        await prisma.auditLog.deleteMany({ where: { entityId: regularUser.id } }).catch(() => {});
        await prisma.user.deleteMany({ where: { id: regularUser.id } }).catch(() => {});
      }
      if (teamLeaderUser) {
        await prisma.auditLog.deleteMany({ where: { entityId: teamLeaderUser.id } }).catch(() => {});
        await prisma.user.deleteMany({ where: { id: teamLeaderUser.id } }).catch(() => {});
      }
      if (adminUser) {
        await prisma.auditLog.deleteMany({ where: { userId: adminUser.id } }).catch(() => {});
        await prisma.user.deleteMany({ where: { id: adminUser.id } }).catch(() => {});
      }
      console.log(`  Cleanup completed.\n`);
    } catch (cleanupErr) {
      console.warn(`  Warning during cleanup:`, cleanupErr.message);
    }
  }

  // Final Summary
  console.log(`${CYAN}----------------------------------------------------------------${RESET}`);
  console.log(`  Pass 7 Tests Passed: ${passedTests}/${totalTests}`);
  if (passedTests === totalTests && totalTests > 0) {
    console.log(`  ${GREEN}ALL PASS 7 ADMIN STORAGE & QUOTA TESTS PASSED AUTHORITATIVELY!${RESET}`);
  } else {
    console.error(`  ${RED}SOME PASS 7 TESTS FAILED.${RESET}`);
    process.exit(1);
  }
  console.log(`${CYAN}================================================================\n${RESET}`);
}

runPass7TestSuite().catch((err) => {
  console.error('Fatal test suite failure:', err);
  process.exit(1);
});
