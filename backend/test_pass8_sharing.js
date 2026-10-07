require('dotenv').config();
const prisma = require('./src/db');
const crypto = require('crypto');
const filesController = require('./src/controllers/files');
const foldersController = require('./src/controllers/folders');
const sharesController = require('./src/controllers/shares');
const storageShareService = require('./src/services/storageShareService');
const storageScopeService = require('./src/services/storageScopeService');
const storageQuotaService = require('./src/services/storageQuotaService');

// ANSI formatting
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';

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

// In-Memory S3 & Drive tracking
const networkTracker = {
  s3CallsCount: 0,
  driveCallsCount: 0
};

function setupMockNetwork() {
  const origFetch = global.fetch;

  global.fetch = async (url, options = {}) => {
    const urlStr = String(url);

    // Track if any S3 network calls happen
    if (urlStr.includes('s3.amazonaws.com') || urlStr.includes('amazonaws.com')) {
      networkTracker.s3CallsCount++;
      return new Response(null, { status: 500, statusText: 'S3 should not be called' });
    }

    // Mock Google Drive API calls
    if (urlStr.includes('googleapis.com')) {
      networkTracker.driveCallsCount++;
      if (urlStr.includes('files?q=') || urlStr.includes('files?')) {
        return new Response(JSON.stringify({ files: [{ id: 'mock_drive_folder_id', name: 'Mock' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ id: 'mock_drive_file_id', name: 'Mock' }), {
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

function createMockReqRes({ userId = null, params = {}, body = {}, query = {} } = {}) {
  const req = {
    userId,
    params,
    body,
    query,
    headers: {}
  };
  let statusCode = 200;
  let responseData = null;
  const headersSent = {};

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    setHeader(name, value) {
      headersSent[name] = value;
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

async function runPass8TestSuite() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   DEVHUB PASS 8 TEST SUITE: PERSONAL FILE & FOLDER SHARING    ${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  setupMockNetwork();

  const runId = crypto.randomBytes(4).toString('hex');
  let testUsers = [];
  let testTeam = null;
  let personalFolder = null;
  let personalFile = null;
  let teamFolder = null;
  let teamFile = null;

  try {
    // -------------------------------------------------------------
    // SETUP: Create isolated test users, team, and resources
    // -------------------------------------------------------------
    console.log(`${YELLOW}>>> Setting up test environment (users, resources, teams)...${RESET}`);

    // Admin user (authoritative system administrator)
    let adminUser = await prisma.user.findFirst({
      where: { email: 'admin@devhub.test' }
    });
    if (!adminUser) {
      adminUser = await prisma.user.create({
        data: {
          name: 'Admin',
          email: 'admin@devhub.test',
          passwordHash: 'Password123!',
          role: 'Admin',
          status: 'Active'
        }
      });
    } else if (adminUser.role !== 'Admin') {
      adminUser = await prisma.user.update({
        where: { id: adminUser.id },
        data: { role: 'Admin' }
      });
    }

    // Owner user (regular member)
    const ownerUser = await prisma.user.create({
      data: {
        name: `Owner_${runId}`,
        email: `owner_${runId}@devhub.test`,
        passwordHash: 'Password123!',
        role: 'Member',
        status: 'Active'
      }
    });

    // View User (regular member)
    const viewUser = await prisma.user.create({
      data: {
        name: `ViewUser_${runId}`,
        email: `view_${runId}@devhub.test`,
        passwordHash: 'Password123!',
        role: 'Member',
        status: 'Active'
      }
    });

    // Edit User (regular member)
    const editUser = await prisma.user.create({
      data: {
        name: `EditUser_${runId}`,
        email: `edit_${runId}@devhub.test`,
        passwordHash: 'Password123!',
        role: 'Member',
        status: 'Active'
      }
    });

    // Unshared User (regular member)
    const unsharedUser = await prisma.user.create({
      data: {
        name: `Unshared_${runId}`,
        email: `unshared_${runId}@devhub.test`,
        passwordHash: 'Password123!',
        role: 'Member',
        status: 'Active'
      }
    });

    // Deactivated User
    const deactivatedUser = await prisma.user.create({
      data: {
        name: `Deactivated_${runId}`,
        email: `deactivated_${runId}@devhub.test`,
        passwordHash: 'Password123!',
        role: 'Member',
        status: 'Deactivated'
      }
    });

    testUsers = [ownerUser, viewUser, editUser, unsharedUser, deactivatedUser];

    // Create Team
    testTeam = await prisma.team.create({
      data: {
        name: `Pass8_Team_${runId}`,
        createdById: ownerUser.id,
        members: {
          create: [
            { userId: ownerUser.id, role: 'Leader' },
            { userId: viewUser.id, role: 'Member' }
          ]
        }
      }
    });

    // Create Personal Folder
    personalFolder = await prisma.folder.create({
      data: {
        name: `PersonalFolder_${runId}`,
        storageScope: 'PERSONAL',
        creatorId: ownerUser.id
      }
    });

    // Create Personal File inside Personal Folder
    personalFile = await prisma.file.create({
      data: {
        name: `PersonalDocument_${runId}.pdf`,
        type: 'application/pdf',
        size: BigInt(2048576), // 2 MB
        storagePath: `gdrive://mock_doc_${runId}`,
        driveFileId: `mock_drive_file_${runId}`,
        storageProvider: 'google_drive',
        storageScope: 'PERSONAL',
        uploaderId: ownerUser.id,
        folderId: personalFolder.id
      }
    });

    // Standalone Personal File outside folder
    const standalonePersonalFile = await prisma.file.create({
      data: {
        name: `Standalone_${runId}.txt`,
        type: 'text/plain',
        size: BigInt(1024),
        storagePath: `gdrive://mock_standalone_${runId}`,
        driveFileId: `mock_drive_standalone_${runId}`,
        storageProvider: 'google_drive',
        storageScope: 'PERSONAL',
        uploaderId: ownerUser.id,
        folderId: null
      }
    });

    // Create Team Folder and File
    teamFolder = await prisma.folder.create({
      data: {
        name: `TeamFolder_${runId}`,
        storageScope: 'TEAM',
        teamId: testTeam.id,
        creatorId: ownerUser.id
      }
    });

    teamFile = await prisma.file.create({
      data: {
        name: `TeamFile_${runId}.pdf`,
        type: 'application/pdf',
        size: BigInt(1048576),
        storagePath: `gdrive://mock_team_${runId}`,
        driveFileId: `mock_drive_team_${runId}`,
        storageProvider: 'google_drive',
        storageScope: 'TEAM',
        teamId: testTeam.id,
        uploaderId: ownerUser.id
      }
    });

    console.log(`${GREEN}Setup completed successfully.${RESET}\n`);

    // -------------------------------------------------------------
    // TEST 1: Owner can share file with VIEW permission
    // -------------------------------------------------------------
    {
      const { req, res } = createMockReqRes({
        userId: ownerUser.id,
        params: { id: standalonePersonalFile.id },
        body: { targetUser: viewUser.email, permission: 'VIEW' }
      });
      await sharesController.shareFile(req, res);
      const data = res.getData();
      const pass = res.getStatusCode() === 201 &&
                   data?.success === true &&
                   data?.share?.permission === 'VIEW' &&
                   data?.share?.sharedWith?.id === viewUser.id;
      report(1, pass, 'Owner can share personal file with target user (VIEW permission)');
    }

    // -------------------------------------------------------------
    // TEST 2: Owner can share folder with VIEW permission
    // -------------------------------------------------------------
    {
      const { req, res } = createMockReqRes({
        userId: ownerUser.id,
        params: { id: personalFolder.id },
        body: { targetUser: viewUser.email, permission: 'VIEW' }
      });
      await sharesController.shareFolder(req, res);
      const data = res.getData();
      const pass = res.getStatusCode() === 201 &&
                   data?.success === true &&
                   data?.share?.permission === 'VIEW' &&
                   data?.share?.sharedWith?.id === viewUser.id;
      report(2, pass, 'Owner can share personal folder with target user (VIEW permission)');
    }

    // -------------------------------------------------------------
    // TEST 3: VIEW user can read & download shared file
    // -------------------------------------------------------------
    {
      const { req: getReq, res: getRes } = createMockReqRes({
        userId: viewUser.id,
        params: { id: standalonePersonalFile.id }
      });
      await filesController.getFileById(getReq, getRes);

      const { req: dlReq, res: dlRes } = createMockReqRes({
        userId: viewUser.id,
        params: { id: standalonePersonalFile.id }
      });
      await filesController.downloadFile(dlReq, dlRes);

      const pass = getRes.getStatusCode() === 200 &&
                   getRes.getData()?.success === true &&
                   dlRes.getStatusCode() === 200 &&
                   dlRes.getData()?.success === true;
      report(3, pass, 'VIEW user can read file metadata and obtain download URL');
    }

    // -------------------------------------------------------------
    // TEST 4: VIEW user CANNOT edit (rename) or delete file
    // -------------------------------------------------------------
    {
      const { req: patchReq, res: patchRes } = createMockReqRes({
        userId: viewUser.id,
        params: { id: standalonePersonalFile.id },
        body: { name: 'HackedName.txt' }
      });
      await filesController.updateFile(patchReq, patchRes);

      const { req: delReq, res: delRes } = createMockReqRes({
        userId: viewUser.id,
        params: { id: standalonePersonalFile.id }
      });
      await filesController.deleteFile(delReq, delRes);

      const pass = patchRes.getStatusCode() === 403 &&
                   delRes.getStatusCode() === 403;
      report(4, pass, 'VIEW user is strictly denied from renaming or deleting the file (403)');
    }

    // -------------------------------------------------------------
    // TEST 5: EDIT user can perform allowed modifications (rename)
    // -------------------------------------------------------------
    {
      // First share standalone file with editUser as EDIT
      const { req: shareReq, res: shareRes } = createMockReqRes({
        userId: ownerUser.id,
        params: { id: standalonePersonalFile.id },
        body: { targetUser: editUser.id, permission: 'EDIT' }
      });
      await sharesController.shareFile(shareReq, shareRes);

      // Now editUser renames the file
      const newName = `RenamedByEditor_${runId}.txt`;
      const { req: patchReq, res: patchRes } = createMockReqRes({
        userId: editUser.id,
        params: { id: standalonePersonalFile.id },
        body: { name: newName }
      });
      await filesController.updateFile(patchReq, patchRes);

      const pass = patchRes.getStatusCode() === 200 &&
                   patchRes.getData()?.file?.name === newName;
      report(5, pass, 'EDIT user can rename shared file according to EDIT permission');
    }

    // -------------------------------------------------------------
    // TEST 6: Unshared user is denied
    // -------------------------------------------------------------
    {
      const { req: getReq, res: getRes } = createMockReqRes({
        userId: unsharedUser.id,
        params: { id: standalonePersonalFile.id }
      });
      await filesController.getFileById(getReq, getRes);

      const { req: dlReq, res: dlRes } = createMockReqRes({
        userId: unsharedUser.id,
        params: { id: standalonePersonalFile.id }
      });
      await filesController.downloadFile(dlReq, dlRes);

      const pass = getRes.getStatusCode() === 403 && dlRes.getStatusCode() === 403;
      report(6, pass, 'Unshared user is denied read and download access (403 Forbidden)');
    }

    // -------------------------------------------------------------
    // TEST 7: Owner can revoke access
    // -------------------------------------------------------------
    {
      const { req, res } = createMockReqRes({
        userId: ownerUser.id,
        params: { id: standalonePersonalFile.id, userId: viewUser.id }
      });
      await sharesController.revokeFileShare(req, res);
      const pass = res.getStatusCode() === 200 && res.getData()?.success === true;
      report(7, pass, 'Owner can successfully revoke file share access');
    }

    // -------------------------------------------------------------
    // TEST 8: Revoked user is immediately denied
    // -------------------------------------------------------------
    {
      const { req, res } = createMockReqRes({
        userId: viewUser.id,
        params: { id: standalonePersonalFile.id }
      });
      await filesController.getFileById(req, res);
      const pass = res.getStatusCode() === 403;
      report(8, pass, 'Revoked user is immediately denied file access (403 Forbidden)');
    }

    // -------------------------------------------------------------
    // TEST 9: Duplicate share prevented (updates permission instead)
    // -------------------------------------------------------------
    {
      // First share with VIEW
      const { req: s1Req, res: s1Res } = createMockReqRes({
        userId: ownerUser.id,
        params: { id: standalonePersonalFile.id },
        body: { targetUser: viewUser.email, permission: 'VIEW' }
      });
      await sharesController.shareFile(s1Req, s1Res);

      // Share again with EDIT
      const { req: s2Req, res: s2Res } = createMockReqRes({
        userId: ownerUser.id,
        params: { id: standalonePersonalFile.id },
        body: { targetUser: viewUser.email, permission: 'EDIT' }
      });
      await sharesController.shareFile(s2Req, s2Res);

      // Verify only 1 share record exists for (file, viewUser)
      const count = await prisma.fileShare.count({
        where: { fileId: standalonePersonalFile.id, sharedWithId: viewUser.id }
      });

      const pass = s2Res.getStatusCode() === 201 &&
                   s2Res.getData()?.share?.permission === 'EDIT' &&
                   count === 1;
      report(9, pass, 'Duplicate share is prevented; permission is updated in-place with exactly 1 ACL record');
    }

    // -------------------------------------------------------------
    // TEST 10: Sharing someone else\'s file denied
    // -------------------------------------------------------------
    {
      // unsharedUser attempts to share owner\'s file
      const { req, res } = createMockReqRes({
        userId: unsharedUser.id,
        params: { id: standalonePersonalFile.id },
        body: { targetUser: editUser.email, permission: 'VIEW' }
      });
      await sharesController.shareFile(req, res);
      const pass = res.getStatusCode() === 403 || res.getStatusCode() === 400;
      report(10, pass, 'Non-owner non-admin user cannot share another user\'s personal file (403)');
    }

    // -------------------------------------------------------------
    // TEST 11: TEAM resource cannot use personal sharing
    // -------------------------------------------------------------
    {
      const { req, res } = createMockReqRes({
        userId: ownerUser.id,
        params: { id: teamFile.id },
        body: { targetUser: editUser.email, permission: 'VIEW' }
      });
      await sharesController.shareFile(req, res);
      const data = res.getData();
      const pass = res.getStatusCode() === 400 &&
                   data?.message?.includes('TEAM resources cannot be shared');
      report(11, pass, 'Attempt to share TEAM-owned resource via personal sharing is rejected (400)');
    }

    // -------------------------------------------------------------
    // TEST 12: Admin retains universal access
    // -------------------------------------------------------------
    {
      const { req: getReq, res: getRes } = createMockReqRes({
        userId: adminUser.id,
        params: { id: standalonePersonalFile.id }
      });
      await filesController.getFileById(getReq, getRes);

      const { req: dlReq, res: dlRes } = createMockReqRes({
        userId: adminUser.id,
        params: { id: standalonePersonalFile.id }
      });
      await filesController.downloadFile(dlReq, dlRes);

      const pass = getRes.getStatusCode() === 200 && dlRes.getStatusCode() === 200;
      if (!pass) {
        console.log('Test 12 Debug - getRes:', getRes.getStatusCode(), getRes.getData(), 'dlRes:', dlRes.getStatusCode(), dlRes.getData());
      }
      report(12, pass, 'Admin retains universal access to personal unshared files');
    }

    // -------------------------------------------------------------
    // TEST 13: Folder inheritance works for files inside shared folder
    // -------------------------------------------------------------
    {
      // personalFolder was shared with viewUser in Test 2.
      // personalFile is inside personalFolder, but has NO direct FileShare record!
      const directShare = await prisma.fileShare.findUnique({
        where: {
          fileId_sharedWithId: {
            fileId: personalFile.id,
            sharedWithId: viewUser.id
          }
        }
      });

      const { req: getReq, res: getRes } = createMockReqRes({
        userId: viewUser.id,
        params: { id: personalFile.id }
      });
      await filesController.getFileById(getReq, getRes);

      const pass = !directShare &&
                   getRes.getStatusCode() === 200 &&
                   getRes.getData()?.file?.id === personalFile.id;
      report(13, pass, 'Descendant file dynamically inherits VIEW access from parent folder without ACL duplication');
    }

    // -------------------------------------------------------------
    // TEST 14: Revoking folder share removes inherited access
    // -------------------------------------------------------------
    {
      // Revoke folder share for viewUser
      const { req: revReq, res: revRes } = createMockReqRes({
        userId: ownerUser.id,
        params: { id: personalFolder.id, userId: viewUser.id }
      });
      await sharesController.revokeFolderShare(revReq, revRes);

      // Now viewUser tries to access the child file
      const { req: getReq, res: getRes } = createMockReqRes({
        userId: viewUser.id,
        params: { id: personalFile.id }
      });
      await filesController.getFileById(getReq, getRes);

      const pass = revRes.getStatusCode() === 200 && getRes.getStatusCode() === 403;
      report(14, pass, 'Revoking folder share immediately strips inherited access to all descendant files');
    }

    // -------------------------------------------------------------
    // TEST 15: Moving file out of shared folder removes inherited access
    // -------------------------------------------------------------
    {
      // Re-share personalFolder with viewUser
      await storageShareService.shareFolder({
        folderId: personalFolder.id,
        ownerUser,
        targetUserEmailOrId: viewUser.email,
        permission: 'VIEW'
      });

      // Move personalFile out to root (folderId: null)
      await prisma.file.update({
        where: { id: personalFile.id },
        data: { folderId: null }
      });

      // Now viewUser tries to access personalFile
      const { req: getReq, res: getRes } = createMockReqRes({
        userId: viewUser.id,
        params: { id: personalFile.id }
      });
      await filesController.getFileById(getReq, getRes);

      const pass = getRes.getStatusCode() === 403;
      report(15, pass, 'Moving file out of shared folder immediately severs inherited access');
    }

    // -------------------------------------------------------------
    // TEST 16: Quota remains unchanged
    // -------------------------------------------------------------
    {
      // Fetch owner's allocation & usage
      const ownerAllocBefore = await storageQuotaService.getPersonalQuota(ownerUser.id);
      const viewAllocBefore = await storageQuotaService.getPersonalQuota(viewUser.id);

      // Perform a share
      await storageShareService.shareFile({
        fileId: standalonePersonalFile.id,
        ownerUser,
        targetUserEmailOrId: viewUser.email,
        permission: 'VIEW'
      });

      const ownerAllocAfter = await storageQuotaService.getPersonalQuota(ownerUser.id);
      const viewAllocAfter = await storageQuotaService.getPersonalQuota(viewUser.id);

      const pass = ownerAllocBefore.usedBytes === ownerAllocAfter.usedBytes &&
                   viewAllocBefore.usedBytes === viewAllocAfter.usedBytes &&
                   ownerAllocBefore.allocatedBytes === ownerAllocAfter.allocatedBytes;
      report(16, pass, 'Sharing creates zero additional quota usage or physical storage allocations');
    }

    // -------------------------------------------------------------
    // TEST 17: Audit records created
    // -------------------------------------------------------------
    {
      const shareCreatedLogs = await prisma.auditLog.findMany({
        where: { entityType: 'FileShare', action: 'Created' }
      });
      const shareUpdatedLogs = await prisma.auditLog.findMany({
        where: { entityType: 'FileShare', action: 'Updated' }
      });
      const shareRevokedLogs = await prisma.auditLog.findMany({
        where: { entityType: 'FileShare', action: 'Deleted' }
      });

      const pass = shareCreatedLogs.length > 0 &&
                   shareUpdatedLogs.length > 0 &&
                   shareRevokedLogs.length > 0;
      report(17, pass, 'Authoritative audit records are created for share creation, permission change, and revocation');
    }

    // -------------------------------------------------------------
    // TEST 18: Zero S3 operations
    // -------------------------------------------------------------
    {
      const pass = networkTracker.s3CallsCount === 0;
      report(18, pass, 'Zero S3 calls occurred throughout all sharing and access resolution workflows');
    }

  } catch (err) {
    console.error('Fatal error in test suite execution:', err);
  } finally {
    // -------------------------------------------------------------
    // CLEANUP: Clean up created test entities
    // -------------------------------------------------------------
    console.log(`\n${YELLOW}>>> Cleaning up test entities...${RESET}`);
    try {
      if (testTeam) {
        await prisma.file.deleteMany({ where: { teamId: testTeam.id } });
        await prisma.folder.deleteMany({ where: { teamId: testTeam.id } });
        await prisma.teamMember.deleteMany({ where: { teamId: testTeam.id } });
        await prisma.team.delete({ where: { id: testTeam.id } }).catch(() => {});
      }

      for (const u of testUsers) {
        await prisma.fileShare.deleteMany({ where: { OR: [{ ownerId: u.id }, { sharedWithId: u.id }] } });
        await prisma.folderShare.deleteMany({ where: { OR: [{ ownerId: u.id }, { sharedWithId: u.id }] } });
        await prisma.file.deleteMany({ where: { uploaderId: u.id } });
        await prisma.folder.deleteMany({ where: { creatorId: u.id } });
        await prisma.personalStorageAllocation.deleteMany({ where: { userId: u.id } });
        await prisma.auditLog.deleteMany({ where: { userId: u.id } });
        await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
      }
      console.log(`${GREEN}Cleanup finished.${RESET}\n`);
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr.message);
    }
  }

  // Final Summary
  console.log(`${CYAN}================================================================${RESET}`);
  console.log(`PASS 8 TEST SUMMARY: ${passedTests}/${totalTests} Tests Passed`);
  if (passedTests === totalTests) {
    console.log(`${GREEN}ALL PASS 8 TESTS PASSED SUCCESSFULLY!${RESET}`);
  } else {
    console.error(`${RED}SOME TESTS FAILED!${RESET}`);
  }
  console.log(`${CYAN}================================================================${RESET}\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runPass8TestSuite().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
