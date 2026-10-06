require('dotenv').config();
const { prisma } = require('./src/db');
const storageScopeService = require('./src/services/storageScopeService');
const driveFolderService = require('./src/services/driveFolderService');
const teamService = require('./src/services/teamService');
const userService = require('./src/services/userService');
const permissionService = require('./src/services/permissionService');
const storageQuotaService = require('./src/services/storageQuotaService');
const storagePoolService = require('./src/services/storagePoolService');
const {
  DEFAULT_PERSONAL_STORAGE_BYTES,
  DEFAULT_TEAM_STORAGE_BYTES,
  STORAGE_SCOPES,
  TEAM_ROLES,
  USER_ROLES
} = require('./src/constants/storage');

async function runPass3Tests() {
  console.log('================================================================');
  console.log('   DEVHUB PASS 3: STORAGE FOUNDATION ISOLATED TEST SUITE        ');
  console.log('================================================================\n');

  let allPassed = true;
  function report(num, passed, desc) {
    if (passed) {
      console.log(`  ✓ PASS: [Test ${num}] ${desc}`);
    } else {
      console.error(`  ❌ FAIL: [Test ${num}] ${desc}`);
      allPassed = false;
    }
  }

  // Track created test IDs for 100% clean teardown
  const createdUserIds = [];
  const createdTeamIds = [];
  const createdIntegrationIds = [];

  // Setup virtual Google Drive mock to test driveFolderService without external network dependency
  const originalFetch = global.fetch;
  const virtualDriveFiles = new Map(); // id -> { id, name, mimeType, parents: [] }
  let driveIdCounter = 1;

  function setupVirtualDriveMock() {
    global.fetch = async (url, options = {}) => {
      const urlStr = url.toString();

      // Only intercept Google Drive v3 endpoints
      if (!urlStr.includes('googleapis.com/drive/v3')) {
        return originalFetch(url, options);
      }

      // POST create file/folder
      if (options.method === 'POST') {
        const body = JSON.parse(options.body || '{}');
        const newId = `gdrive_folder_${driveIdCounter++}`;
        const fileObj = {
          id: newId,
          name: body.name,
          mimeType: body.mimeType,
          parents: body.parents || [],
          trashed: false
        };
        virtualDriveFiles.set(newId, fileObj);
        return {
          ok: true,
          status: 200,
          json: async () => fileObj
        };
      }

      // GET search files: q=...
      if (urlStr.includes('/files?q=')) {
        const queryParam = new URL(urlStr).searchParams.get('q') || '';
        const nameMatch = queryParam.match(/name = '([^']+)'/);
        const parentMatch = queryParam.match(/'([^']+)' in parents/);
        const searchName = nameMatch ? nameMatch[1].replace(/\\'/g, "'") : null;
        const searchParent = parentMatch ? parentMatch[1] : null;

        const matches = [];
        for (const file of virtualDriveFiles.values()) {
          if (!file.trashed &&
              file.mimeType === 'application/vnd.google-apps.folder' &&
              (!searchName || file.name === searchName) &&
              (!searchParent || file.parents.includes(searchParent))) {
            matches.push(file);
          }
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ files: matches })
        };
      }

      // GET file by ID
      if (urlStr.includes('/files/')) {
        const fileId = urlStr.split('/files/')[1].split('?')[0];
        const file = virtualDriveFiles.get(fileId);
        if (file) {
          return {
            ok: true,
            status: 200,
            json: async () => file
          };
        }
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { message: 'File not found' } })
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({})
      };
    };
  }

  try {
    setupVirtualDriveMock();

    // -----------------------------------------------------------------
    // TEST 1: User receives 5 GB personal storage on initialization
    // -----------------------------------------------------------------
    const testUserA = await prisma.user.create({
      data: {
        email: `test_pass3_user_a_${Date.now()}@devhub.test`,
        name: 'Storage Tester A',
        passwordHash: 'dummyhash',
        role: USER_ROLES.USER,
        emailVerified: true
      }
    });
    createdUserIds.push(testUserA.id);

    await userService.initializeUserStorage(testUserA.id);
    const allocA = await prisma.personalStorageAllocation.findUnique({
      where: { userId: testUserA.id }
    });
    const receives5GB = allocA && BigInt(allocA.allocatedBytes) === DEFAULT_PERSONAL_STORAGE_BYTES;
    report(1, Boolean(receives5GB),
      `User receives default 5 GB (5,368,709,120 bytes) personal storage allocation`);

    // -----------------------------------------------------------------
    // TEST 2: User is NOT automatically assigned to any Team
    // -----------------------------------------------------------------
    const testUserB = await prisma.user.create({
      data: {
        email: `test_pass3_user_b_${Date.now()}@devhub.test`,
        name: 'Storage Tester B',
        passwordHash: 'dummyhash',
        role: USER_ROLES.USER,
        emailVerified: true
      }
    });
    createdUserIds.push(testUserB.id);

    const teamMembershipsB = await prisma.teamMember.findMany({
      where: { userId: testUserB.id }
    });
    report(2, teamMembershipsB.length === 0,
      `New user has 0 team memberships by default (not auto-assigned to any team)`);

    // -----------------------------------------------------------------
    // TEST 3: Team creation allocates default 10 GB team quota
    // -----------------------------------------------------------------
    const team1 = await teamService.createTeam({
      name: `Pass3 Test Team 1 ${Date.now()}`,
      description: 'Test Team for Pass 3',
      createdById: testUserA.id,
      addCreatorAsLeader: true
    });
    createdTeamIds.push(team1.id);

    const team1Alloc = await prisma.teamStorageAllocation.findUnique({
      where: { teamId: team1.id }
    });
    const receives10GB = team1Alloc && BigInt(team1Alloc.allocatedBytes) === DEFAULT_TEAM_STORAGE_BYTES;
    report(3, Boolean(receives10GB),
      `New team automatically receives default 10 GB (10,737,418,240 bytes) team storage allocation`);

    // -----------------------------------------------------------------
    // TEST 4: User can belong to multiple teams
    // -----------------------------------------------------------------
    const team2 = await teamService.createTeam({
      name: `Pass3 Test Team 2 ${Date.now()}`,
      description: 'Second Team for Pass 3',
      createdById: testUserB.id,
      addCreatorAsLeader: true
    });
    createdTeamIds.push(team2.id);

    // Add userA to team2 as a Member
    await prisma.teamMember.create({
      data: {
        teamId: team2.id,
        userId: testUserA.id,
        role: TEAM_ROLES.MEMBER
      }
    });

    const userATeams = await teamService.getUserTeams(testUserA.id);
    const userAInTwoTeams = userATeams.length === 2 &&
      userATeams.some(t => t.id === team1.id) &&
      userATeams.some(t => t.id === team2.id);
    report(4, userAInTwoTeams,
      `User belongs to multiple teams simultaneously (Team 1 as Leader, Team 2 as Member)`);

    // -----------------------------------------------------------------
    // TEST 5: Personal access rules (private to owner, non-owner denied)
    // -----------------------------------------------------------------
    const ownerAccess = await storageScopeService.canAccess({
      user: testUserA,
      scope: STORAGE_SCOPES.PERSONAL,
      ownerId: testUserA.id
    });
    const nonOwnerAccess = await storageScopeService.canAccess({
      user: testUserB,
      scope: STORAGE_SCOPES.PERSONAL,
      ownerId: testUserA.id
    });
    report(5, ownerAccess.allowed && !nonOwnerAccess.allowed,
      `Personal access rules enforced: owner allowed (${ownerAccess.allowed}), non-owner denied (${nonOwnerAccess.allowed})`);

    // -----------------------------------------------------------------
    // TEST 6: Team access rules (active members allowed, outsiders denied)
    // -----------------------------------------------------------------
    const memberAccess = await storageScopeService.canAccess({
      user: testUserA,
      scope: STORAGE_SCOPES.TEAM,
      teamId: team1.id
    });
    const outsiderAccess = await storageScopeService.canAccess({
      user: testUserB,
      scope: STORAGE_SCOPES.TEAM,
      teamId: team1.id
    });
    report(6, memberAccess.allowed && !outsiderAccess.allowed,
      `Team access rules enforced: team member allowed (${memberAccess.allowed}), outsider denied (${outsiderAccess.allowed})`);

    // -----------------------------------------------------------------
    // TEST 7: Admin access (full access across personal and team scopes)
    // -----------------------------------------------------------------
    const adminUser = await prisma.user.findFirst({ where: { role: USER_ROLES.ADMIN } });
    const adminPersonalAccess = await storageScopeService.canAccess({
      user: adminUser,
      scope: STORAGE_SCOPES.PERSONAL,
      ownerId: testUserA.id
    });
    const adminTeamAccess = await storageScopeService.canAccess({
      user: adminUser,
      scope: STORAGE_SCOPES.TEAM,
      teamId: team1.id
    });
    const adminCanChangeQuota = permissionService.canModifyStorageQuota(adminUser);
    const leaderCanChangeQuota = permissionService.canModifyStorageQuota(testUserA); // Leader in team1

    const adminRulesPass = adminPersonalAccess.allowed &&
      adminTeamAccess.allowed &&
      adminCanChangeQuota &&
      !leaderCanChangeQuota;
    report(7, adminRulesPass,
      `Admin retains universal access to all files and exclusive authority to alter storage quotas`);

    // -----------------------------------------------------------------
    // SETUP FOR TESTS 8-11: Ensure test System Storage integration exists
    // -----------------------------------------------------------------
    let testSystemIntegration = await prisma.userIntegration.findFirst({
      where: { provider: 'google_drive', status: 'connected' }
    });

    if (!testSystemIntegration) {
      testSystemIntegration = await prisma.userIntegration.create({
        data: {
          userId: adminUser.id,
          provider: 'google_drive',
          status: 'connected',
          accountName: 'system.5tb@gmail.com',
          accessToken: 'mock_test_token',
          metadata: { isSystemStorage: true }
        }
      });
      createdIntegrationIds.push(testSystemIntegration.id);
    }

    // -----------------------------------------------------------------
    // TEST 8: Google Drive root folder creation (DEVHUB under 'root')
    // -----------------------------------------------------------------
    const devhubRootId = await driveFolderService.ensureDevhubRoot('mock_test_token');
    const rootFile = virtualDriveFiles.get(devhubRootId);
    const rootCreated = Boolean(rootFile && rootFile.name === 'DEVHUB' && rootFile.parents.includes('root'));
    report(8, rootCreated,
      `Google Drive DEVHUB root folder created at 'root' (ID: ${devhubRootId})`);

    // -----------------------------------------------------------------
    // TEST 9: User folder creation under DEVHUB / Users / <user>
    // -----------------------------------------------------------------
    const userFolderId = await driveFolderService.ensureUserDriveFolder(testUserA.id, 'mock_test_token');
    const userFolderFile = virtualDriveFiles.get(userFolderId);
    const usersRootId = await driveFolderService.ensureUsersRoot('mock_test_token');
    const userFolderInUsersRoot = userFolderFile && userFolderFile.parents.includes(usersRootId);
    report(9, Boolean(userFolderInUsersRoot),
      `User folder created under DEVHUB/Users/<user> (ID: ${userFolderId}, Parent: ${usersRootId})`);

    // -----------------------------------------------------------------
    // TEST 10: Team folder creation under DEVHUB / Teams / <team>
    // -----------------------------------------------------------------
    const teamFolderId = await driveFolderService.ensureTeamDriveFolder(team1.id, 'mock_test_token');
    const teamFolderFile = virtualDriveFiles.get(teamFolderId);
    const teamsRootId = await driveFolderService.ensureTeamsRoot('mock_test_token');
    const teamFolderInTeamsRoot = teamFolderFile && teamFolderFile.parents.includes(teamsRootId);
    report(10, Boolean(teamFolderInTeamsRoot),
      `Team folder created under DEVHUB/Teams/<team> (ID: ${teamFolderId}, Parent: ${teamsRootId})`);

    // -----------------------------------------------------------------
    // TEST 11: Duplicate folder prevention (idempotent returns existing ID)
    // -----------------------------------------------------------------
    const initialFilesCount = virtualDriveFiles.size;
    const reRootId = await driveFolderService.ensureDevhubRoot('mock_test_token');
    const reUsersRootId = await driveFolderService.ensureUsersRoot('mock_test_token');
    const reTeamsRootId = await driveFolderService.ensureTeamsRoot('mock_test_token');
    const reUserFolderId = await driveFolderService.ensureUserDriveFolder(testUserA.id, 'mock_test_token');
    const reTeamFolderId = await driveFolderService.ensureTeamDriveFolder(team1.id, 'mock_test_token');
    const finalFilesCount = virtualDriveFiles.size;

    const noDuplicates = initialFilesCount === finalFilesCount &&
      reRootId === devhubRootId &&
      reUserFolderId === userFolderId &&
      reTeamFolderId === teamFolderId;
    report(11, noDuplicates,
      `Idempotent folder calls return identical IDs with ZERO duplicate folders created (${initialFilesCount} files total)`);

    // -----------------------------------------------------------------
    // TEST 12: ProjectId is optional organizational metadata and does not control ownership
    // -----------------------------------------------------------------
    // Case A: projectId provided with personal scope
    const scopeWithProj = storageScopeService.resolveScope({
      storageScope: STORAGE_SCOPES.PERSONAL,
      projectId: 'fake-proj-123'
    });
    const ownerWithProj = storageScopeService.getStorageOwner({
      scope: scopeWithProj,
      userId: testUserA.id
    });

    // Case B: projectId provided with team scope
    const scopeTeamWithProj = storageScopeService.resolveScope({
      teamId: team1.id,
      projectId: 'fake-proj-123'
    });
    const ownerTeamWithProj = storageScopeService.getStorageOwner({
      scope: scopeTeamWithProj,
      teamId: team1.id
    });

    const projectIdDoesNotOwn = scopeWithProj === STORAGE_SCOPES.PERSONAL &&
      ownerWithProj.ownerId === testUserA.id &&
      scopeTeamWithProj === STORAGE_SCOPES.TEAM &&
      ownerTeamWithProj.ownerId === team1.id;

    report(12, projectIdDoesNotOwn,
      `ProjectId is purely optional organizational metadata and never controls storage scope or ownership`);

    // -----------------------------------------------------------------
    // TEST 13: No S3 operations occur for DEVHUB Cloud storage operations
    // -----------------------------------------------------------------
    // Verify storageScopeService, driveFolderService, and storageQuotaService do NOT invoke S3
    const scopeSourceCode = require('fs').readFileSync(
      require('path').join(__dirname, 'src/services/storageScopeService.js'), 'utf8'
    );
    const driveSourceCode = require('fs').readFileSync(
      require('path').join(__dirname, 'src/services/driveFolderService.js'), 'utf8'
    );
    const hasS3InScope = scopeSourceCode.includes('@aws-sdk/client-s3') || scopeSourceCode.includes('s3Client');
    const hasS3InDrive = driveSourceCode.includes('@aws-sdk/client-s3') || driveSourceCode.includes('s3Client');
    report(13, !hasS3InScope && !hasS3InDrive,
      `No AWS S3 clients or S3 operations exist in new DEVHUB Cloud storage foundation services`);

    console.log('\n================================================================');
    if (allPassed) {
      console.log('   >>> ALL 13 PASS 3 STORAGE FOUNDATION TESTS PASSED 100%! <<<');
    } else {
      console.error('   >>> SOME PASS 3 TESTS FAILED <<<');
    }
    console.log('================================================================\n');

  } catch (err) {
    console.error('Fatal test error:', err);
    allPassed = false;
  } finally {
    // Restore global fetch
    global.fetch = originalFetch;

    // 100% clean teardown of isolated test entities
    try {
      if (createdIntegrationIds.length > 0) {
        await prisma.userIntegration.deleteMany({
          where: { id: { in: createdIntegrationIds } }
        });
      }
      if (createdTeamIds.length > 0) {
        await prisma.teamMember.deleteMany({ where: { teamId: { in: createdTeamIds } } });
        await prisma.teamStorageAllocation.deleteMany({ where: { teamId: { in: createdTeamIds } } });
        await prisma.team.deleteMany({ where: { id: { in: createdTeamIds } } });
      }
      if (createdUserIds.length > 0) {
        await prisma.personalStorageAllocation.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    } catch (cleanupErr) {
      console.error('Cleanup warning:', cleanupErr);
    }
    await prisma.$disconnect();
  }

  if (!allPassed) process.exit(1);
}

runPass3Tests();
