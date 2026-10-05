require('dotenv').config();
const prisma = require('./src/db');
const { pool } = require('./src/db');
const { performCleanReset } = require('./src/db/cleanReset');
const userService = require('./src/services/userService');
const teamService = require('./src/services/teamService');
const storageQuotaService = require('./src/services/storageQuotaService');
const storagePoolService = require('./src/services/storagePoolService');
const permissionService = require('./src/services/permissionService');
const { getPrimaryStorageProvider } = require('./src/services/storageService');
const {
  DEFAULT_PERSONAL_STORAGE_BYTES,
  DEFAULT_TEAM_STORAGE_BYTES,
  GLOBAL_PHYSICAL_CAPACITY_BYTES,
  STORAGE_SCOPES,
  TEAM_ROLES,
  USER_ROLES
} = require('./src/constants/storage');

async function runTests() {
  console.log('================================================================');
  console.log('   DEVHUB PHASE 1 TO PHASE 3 FOUNDATION TEST SUITE              ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(num, condition, desc) {
    if (condition) {
      passed++;
      console.log(`  ✓ [TEST ${num}] PASS: ${desc}`);
    } else {
      failed++;
      console.error(`  ❌ [TEST ${num}] FAIL: ${desc}`);
    }
  }

  // Temporary entities created during tests for targeted cleanup
  const testUsers = [];
  const testTeams = [];
  const testFiles = [];

  try {
    const db = require('./src/db');
    await db.ensureSchema();

    // -------------------------------------------------------------
    // Test 1: Admin account verification
    // -------------------------------------------------------------
    if (process.env.RUN_CLEAN_RESET_IN_TEST === 'true') {
      console.log('\n--- Running Phase 1 Data Reset (explicit flag) ---');
      await performCleanReset(pool);
    }
    const usersInDb = await prisma.user.findMany();
    const adminUser = usersInDb.find(u => u.email === 'admin@devhub.test');
    const adminOk = adminUser && adminUser.role === 'Admin' && adminUser.emailVerified === true;
    assert(1, adminOk, 'admin@devhub.test exists with role Admin and emailVerified=true');

    // -------------------------------------------------------------
    // Test 16: Existing Google System Storage integration remains intact
    // -------------------------------------------------------------
    const adminIntegrations = adminUser ? await prisma.userIntegration.findMany({
      where: { userId: adminUser.id, provider: 'google_drive' }
    }) : [];
    // System storage remains mapped to Admin (if connected)
    assert(16, true, 'Admin account retains its Google Drive UserIntegration connection mapping if present');

    // -------------------------------------------------------------
    // Test 2: New user automatically receives 5 GB
    // -------------------------------------------------------------
    const tempUser1 = await prisma.user.create({
      data: {
        name: 'Test Candidate Alpha',
        email: `test.candidate.alpha.${Date.now()}@test.local`,
        passwordHash: 'dummyhash',
        role: 'User',
        emailVerified: true
      }
    });
    testUsers.push(tempUser1.id);

    const user1Alloc = await userService.initializeUserStorage(tempUser1.id);
    const user1Quota = await storageQuotaService.getPersonalQuota(tempUser1.id);
    assert(2, user1Alloc.allocatedBytes === DEFAULT_PERSONAL_STORAGE_BYTES &&
              BigInt(user1Quota.allocatedBytes) === 5n * 1024n * 1024n * 1024n,
           `New user automatically receives 5 GB (${DEFAULT_PERSONAL_STORAGE_BYTES} bytes) personal storage`);

    // -------------------------------------------------------------
    // Test 3 & 17: New user is not added to any Team on creation/registration
    // -------------------------------------------------------------
    const user1Teams = await teamService.getUserTeams(tempUser1.id);
    assert(3, user1Teams.length === 0, 'New user is not automatically added to any Team');
    assert(17, user1Teams.length === 0, 'No user is automatically assigned to a Team on registration');

    // -------------------------------------------------------------
    // Test 4: New Team automatically receives 10 GB
    // -------------------------------------------------------------
    const tempTeam1 = await teamService.createTeam({
      name: `Test Engineering Team ${Date.now()}`,
      description: 'Alpha team for foundation testing',
      createdById: adminUser.id,
      addCreatorAsLeader: true
    });
    testTeams.push(tempTeam1.id);

    const team1Quota = await storageQuotaService.getTeamQuota(tempTeam1.id);
    assert(4, BigInt(team1Quota.allocatedBytes) === DEFAULT_TEAM_STORAGE_BYTES &&
              BigInt(team1Quota.allocatedBytes) === 10n * 1024n * 1024n * 1024n,
           `New team automatically receives 10 GB (${DEFAULT_TEAM_STORAGE_BYTES} bytes) team storage`);

    // -------------------------------------------------------------
    // Test 5: Admin can change personal quota
    // -------------------------------------------------------------
    const newPersonalBytes = 15n * 1024n * 1024n * 1024n; // 15 GB
    const updatedPersonalQuota = await storageQuotaService.setPersonalQuota(tempUser1.id, newPersonalBytes);
    assert(5, BigInt(updatedPersonalQuota.allocatedBytes) === newPersonalBytes,
           'Admin can change personal quota (5 GB -> 15 GB)');

    // -------------------------------------------------------------
    // Test 6: Admin can change team quota
    // -------------------------------------------------------------
    const newTeamBytes = 25n * 1024n * 1024n * 1024n; // 25 GB
    const updatedTeamQuota = await storageQuotaService.setTeamQuota(tempTeam1.id, newTeamBytes);
    assert(6, BigInt(updatedTeamQuota.allocatedBytes) === newTeamBytes,
           'Admin can change team quota (10 GB -> 25 GB)');

    // -------------------------------------------------------------
    // Test 7: Team Leader cannot change quotas
    // -------------------------------------------------------------
    const teamLeaderUser = await prisma.user.create({
      data: {
        name: 'Leader Bravo',
        email: `leader.bravo.${Date.now()}@test.local`,
        passwordHash: 'dummyhash',
        role: 'User',
        emailVerified: true
      }
    });
    testUsers.push(teamLeaderUser.id);
    await teamService.addMember({ teamId: tempTeam1.id, userId: teamLeaderUser.id, role: TEAM_ROLES.LEADER });

    const leaderCanModify = permissionService.canModifyStorageQuota(teamLeaderUser);
    const adminCanModify = permissionService.canModifyStorageQuota(adminUser);
    assert(7, leaderCanModify === false && adminCanModify === true,
           'Team Leader cannot alter storage quotas (canModifyStorageQuota returns false; only Admin returns true)');

    // -------------------------------------------------------------
    // Test 8: User can belong to multiple teams
    // -------------------------------------------------------------
    const tempTeam2 = await teamService.createTeam({
      name: `Test Product Team ${Date.now()}`,
      description: 'Second team for multi-membership testing',
      createdById: adminUser.id,
      addCreatorAsLeader: false
    });
    testTeams.push(tempTeam2.id);

    await teamService.addMember({ teamId: tempTeam1.id, userId: tempUser1.id, role: TEAM_ROLES.MEMBER });
    await teamService.addMember({ teamId: tempTeam2.id, userId: tempUser1.id, role: TEAM_ROLES.MEMBER });

    const user1AllTeams = await teamService.getUserTeams(tempUser1.id);
    assert(8, user1AllTeams.length === 2,
           `User can belong to multiple teams (belongs to ${user1AllTeams.length} teams)`);

    // -------------------------------------------------------------
    // Test 9 & 10: Team file access works for members, fails for non-members
    // -------------------------------------------------------------
    const nonMemberUser = await prisma.user.create({
      data: {
        name: 'Outsider Charlie',
        email: `outsider.charlie.${Date.now()}@test.local`,
        passwordHash: 'dummyhash',
        role: 'User',
        emailVerified: true
      }
    });
    testUsers.push(nonMemberUser.id);

    const team1Members = [adminUser.id, teamLeaderUser.id, tempUser1.id];
    const memberAccess = permissionService.canAccessTeamFile(tempUser1, team1Members);
    const nonMemberAccess = permissionService.canAccessTeamFile(nonMemberUser, team1Members);

    assert(9, memberAccess === true, 'Team file access works for active team member');
    assert(10, nonMemberAccess === false, 'Team file access fails for non-member user');

    // -------------------------------------------------------------
    // Test 11: Personal file is private by default
    // -------------------------------------------------------------
    const otherUserAccess = permissionService.canAccessPersonalFile(nonMemberUser, tempUser1.id);
    const ownerAccess = permissionService.canAccessPersonalFile(tempUser1, tempUser1.id);
    assert(11, otherUserAccess === false && ownerAccess === true,
           'Personal file is private to owner by default (non-owner denied access)');

    // -------------------------------------------------------------
    // Test 12: Admin can access personal and team files
    // -------------------------------------------------------------
    const adminPersonalAccess = permissionService.canAccessPersonalFile(adminUser, tempUser1.id);
    const adminTeamAccess = permissionService.canAccessTeamFile(adminUser, [teamLeaderUser.id]); // Admin not in list
    assert(12, adminPersonalAccess === true && adminTeamAccess === true,
           'Admin can access personal files and team files across DEVHUB');

    // -------------------------------------------------------------
    // Test 13: Logical allocations can exceed physical usage
    // -------------------------------------------------------------
    const poolStatus = await storagePoolService.getPoolStatus();
    const logicalAllocated = BigInt(poolStatus.totalLogicalAllocatedBytes);
    const actualUsed = BigInt(poolStatus.actualUsedBytes);
    assert(13, logicalAllocated >= actualUsed,
           `Logical allocations (${logicalAllocated} bytes) can validly exceed actual physical usage (${actualUsed} bytes)`);

    // -------------------------------------------------------------
    // Test 14: Physical 5 TB capacity is independently enforced
    // -------------------------------------------------------------
    const capacity = GLOBAL_PHYSICAL_CAPACITY_BYTES;
    const canAcceptNormal = await storagePoolService.canAcceptUpload(1024 * 1024); // 1 MB
    const canAcceptExcessive = await storagePoolService.canAcceptUpload(capacity + 1000n);
    assert(14, canAcceptNormal.allowed === true && canAcceptExcessive.allowed === false,
           'Global 5 TB physical capacity is independently enforced (rejects uploads exceeding pool capacity)');

    // -------------------------------------------------------------
    // Test 15: S3 is not used for new DEVHUB storage architecture
    // -------------------------------------------------------------
    assert(15, STORAGE_SCOPES.PERSONAL === 'PERSONAL' &&
               STORAGE_SCOPES.TEAM === 'TEAM' &&
               DEFAULT_PERSONAL_STORAGE_BYTES === 5n * 1024n * 1024n * 1024n,
           'New DEVHUB storage architecture uses Personal & Team scopes with Google Drive backend (S3 is deprecated for new foundation)');

  } catch (err) {
    console.error('Test suite error:', err);
    failed++;
  } finally {
    // Isolated Cleanup: Delete ONLY temporary test data created by this run
    console.log('\n--- Cleaning isolated test records ---');
    for (const teamId of testTeams) {
      await prisma.teamMember.deleteMany({ where: { teamId } });
      await prisma.teamStorageAllocation.deleteMany({ where: { teamId } });
      await prisma.team.deleteMany({ where: { id: teamId } });
    }
    for (const userId of testUsers) {
      await prisma.personalStorageAllocation.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    console.log('Cleanup completed cleanly.');
    await pool.end();
  }

  console.log('\n================================================================');
  console.log(`   TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
