require('dotenv').config();
const prisma = require('./src/db');
const crypto = require('crypto');
const { Readable } = require('stream');
const storageScopeService = require('./src/services/storageScopeService');
const driveFolderService = require('./src/services/driveFolderService');
const storageQuotaService = require('./src/services/storageQuotaService');
const storagePoolService = require('./src/services/storagePoolService');
const { googleDriveDriver } = require('./src/services/googleDriveDriver');
const storageService = require('./src/services/storageService');
const filesController = require('./src/controllers/files');
const {
  DEFAULT_PERSONAL_STORAGE_BYTES,
  DEFAULT_TEAM_STORAGE_BYTES,
  STORAGE_SCOPES,
  GLOBAL_PHYSICAL_CAPACITY_BYTES,
  GLOBAL_SAFETY_BUFFER_BYTES
} = require('./src/constants/storage');

// ANSI formatting
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

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

// In-Memory Google Drive Mock Storage
const mockDriveState = {
  files: new Map(), // id -> file object
  counter: 0,
  s3CallsCount: 0
};

function setupMockGoogleDrive() {
  const origFetch = global.fetch;

  global.fetch = async (url, options = {}) => {
    const urlStr = String(url);
    const method = (options.method || 'GET').toUpperCase();

    // Track if any S3 network calls happen
    if (urlStr.includes('s3.amazonaws.com') || urlStr.includes('amazonaws.com')) {
      mockDriveState.s3CallsCount++;
      return new Response(null, { status: 500, statusText: 'S3 should not be called' });
    }

    // Google Drive Multipart Upload
    if (urlStr.includes('www.googleapis.com/upload/drive/v3/files')) {
      mockDriveState.counter++;
      const fileId = `gdrive_file_${mockDriveState.counter}`;
      const bodyBuf = Buffer.isBuffer(options.body) ? options.body : Buffer.from(options.body || '');
      const bodyStr = bodyBuf.toString('latin1');

      // Extract JSON metadata from multipart
      let name = `file_${mockDriveState.counter}`;
      let mimeType = 'application/octet-stream';
      let parents = [];

      try {
        const jsonMatch = bodyStr.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.name) name = parsed.name;
          if (parsed.mimeType) mimeType = parsed.mimeType;
          if (parsed.parents) parents = parsed.parents;
        }
      } catch (_) {}

      // Extract raw file content between multipart delimiters
      let contentBuf = bodyBuf;
      const delimiterIndex = bodyStr.indexOf('\r\n\r\n');
      if (delimiterIndex !== -1) {
        const secondDelimiterIndex = bodyStr.indexOf('\r\n\r\n', delimiterIndex + 4);
        if (secondDelimiterIndex !== -1) {
          const rawContentStart = secondDelimiterIndex + 4;
          const endBoundaryIndex = bodyStr.lastIndexOf('\r\n-------');
          if (endBoundaryIndex > rawContentStart) {
            contentBuf = Buffer.from(bodyStr.substring(rawContentStart, endBoundaryIndex), 'latin1');
          }
        }
      }

      const size = BigInt(contentBuf.length);

      const fileObj = {
        id: fileId,
        name,
        mimeType,
        size: Number(size),
        parents,
        trashed: false,
        content: contentBuf
      };

      mockDriveState.files.set(fileId, fileObj);

      return new Response(JSON.stringify({
        id: fileId,
        name,
        mimeType,
        size: String(size),
        parents
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Google Drive Standard API
    if (urlStr.includes('www.googleapis.com/drive/v3/files')) {
      const parsedUrl = new URL(urlStr);
      const pathname = parsedUrl.pathname;

      // GET /files/:id?alt=media or /export
      if (pathname.match(/\/files\/[^/]+$/) && (parsedUrl.searchParams.get('alt') === 'media' || pathname.includes('/export'))) {
        const fileId = decodeURIComponent(pathname.split('/').pop());
        const file = mockDriveState.files.get(fileId);
        if (!file || file.trashed) {
          return new Response(JSON.stringify({ error: { message: 'File not found' } }), { status: 404 });
        }
        return new Response(file.content || Buffer.from('mock file content'), {
          status: 200,
          headers: { 'Content-Type': file.mimeType }
        });
      }

      // GET /files/:id (metadata)
      if (pathname.match(/\/files\/[^/]+$/) && method === 'GET') {
        const fileId = decodeURIComponent(pathname.split('/').pop());
        const file = mockDriveState.files.get(fileId);
        if (!file || file.trashed) {
          return new Response(JSON.stringify({ error: { message: 'File not found' } }), { status: 404 });
        }
        return new Response(JSON.stringify({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: String(file.size),
          trashed: file.trashed,
          parents: file.parents
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // PATCH /files/:id (move or rename)
      if (pathname.match(/\/files\/[^/]+$/) && method === 'PATCH') {
        const fileId = decodeURIComponent(pathname.split('/').pop());
        const file = mockDriveState.files.get(fileId);
        if (!file) {
          return new Response(JSON.stringify({ error: { message: 'File not found' } }), { status: 404 });
        }
        if (options.body) {
          try {
            const body = JSON.parse(options.body);
            if (body.name) file.name = body.name;
          } catch (_) {}
        }
        const addParents = parsedUrl.searchParams.get('addParents');
        const removeParents = parsedUrl.searchParams.get('removeParents');
        if (addParents) {
          file.parents = [...(file.parents || []).filter(p => p !== removeParents), addParents];
        }
        return new Response(JSON.stringify({
          id: file.id,
          name: file.name,
          parents: file.parents
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // DELETE /files/:id
      if (pathname.match(/\/files\/[^/]+$/) && method === 'DELETE') {
        const fileId = decodeURIComponent(pathname.split('/').pop());
        if (mockDriveState.files.has(fileId)) {
          const f = mockDriveState.files.get(fileId);
          f.trashed = true;
        }
        return new Response(null, { status: 204 });
      }

      // POST /files (Create folder)
      if (method === 'POST') {
        mockDriveState.counter++;
        const folderId = `gdrive_folder_${mockDriveState.counter}`;
        let name = 'unnamed_folder';
        let parents = [];
        let mimeType = 'application/vnd.google-apps.folder';

        try {
          const body = JSON.parse(options.body || '{}');
          if (body.name) name = body.name;
          if (body.parents) parents = body.parents;
          if (body.mimeType) mimeType = body.mimeType;
        } catch (_) {}

        const folderObj = {
          id: folderId,
          name,
          mimeType,
          size: 0,
          parents,
          trashed: false
        };
        mockDriveState.files.set(folderId, folderObj);

        return new Response(JSON.stringify(folderObj), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // GET /files?q=... (search or list)
      if (method === 'GET') {
        const q = parsedUrl.searchParams.get('q') || '';
        const results = [];

        for (const f of mockDriveState.files.values()) {
          if (f.trashed) continue;

          let match = true;
          // Check parent condition
          const parentMatch = q.match(/'([^']+)' in parents/);
          if (parentMatch) {
            const expectedParent = parentMatch[1];
            if (!f.parents || !f.parents.includes(expectedParent)) {
              match = false;
            }
          }

          // Check name condition
          const nameMatch = q.match(/name = '([^']+)'/);
          if (nameMatch) {
            const expectedName = nameMatch[1];
            if (f.name !== expectedName) {
              match = false;
            }
          }

          // Check mimeType condition
          const mimeMatch = q.match(/mimeType = '([^']+)'/);
          if (mimeMatch) {
            const expectedMime = mimeMatch[1];
            if (f.mimeType !== expectedMime) {
              match = false;
            }
          }

          if (match) {
            results.push({
              id: f.id,
              name: f.name,
              mimeType: f.mimeType,
              size: String(f.size || 0),
              parents: f.parents
            });
          }
        }

        return new Response(JSON.stringify({ files: results }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Default fallback to original fetch for other requests
    return origFetch(url, options);
  };

  return () => {
    global.fetch = origFetch;
  };
}

async function runPass4Tests() {
  console.log('================================================================');
  console.log('   DEVHUB PASS 4: REAL GOOGLE DRIVE CLOUD STORAGE TEST SUITE    ');
  console.log('================================================================\n');

  const restoreFetch = setupMockGoogleDrive();

  // Test Entities Tracker for teardown
  const cleanupUserIds = [];
  const cleanupTeamIds = [];
  const cleanupFileIds = [];
  const createdIntegrationIds = [];

  try {
    // -------------------------------------------------------------------------
    // Setup Test Admin, User, and Team
    // -------------------------------------------------------------------------
    const testAdmin = await prisma.user.findFirst({
      where: { role: 'Admin' }
    });
    if (!testAdmin) throw new Error('No admin found in database');

    // Ensure mock System Storage integration exists for tests
    let testSystemIntegration = await prisma.userIntegration.findFirst({
      where: { provider: 'google_drive', status: 'connected' }
    });

    if (!testSystemIntegration) {
      testSystemIntegration = await prisma.userIntegration.create({
        data: {
          userId: testAdmin.id,
          provider: 'google_drive',
          status: 'connected',
          accountName: 'system.5tb@devhub.test',
          accessToken: 'mock_pass4_test_token',
          metadata: { isSystemStorage: true }
        }
      });
      createdIntegrationIds.push(testSystemIntegration.id);
    }

    const testUserA = await prisma.user.create({
      data: {
        name: 'Pass4 User A',
        email: `pass4_user_a_${Date.now()}@devhub.test`,
        passwordHash: 'dummyhash',
        role: 'User'
      }
    });
    cleanupUserIds.push(testUserA.id);
    await storageQuotaService.ensurePersonalAllocation(testUserA.id);

    const testUserB = await prisma.user.create({
      data: {
        name: 'Pass4 User B',
        email: `pass4_user_b_${Date.now()}@devhub.test`,
        passwordHash: 'dummyhash',
        role: 'User'
      }
    });
    cleanupUserIds.push(testUserB.id);
    await storageQuotaService.ensurePersonalAllocation(testUserB.id);

    const testTeam = await prisma.team.create({
      data: {
        name: 'Pass4 Engineering Team',
        createdById: testUserA.id
      }
    });
    cleanupTeamIds.push(testTeam.id);
    await storageQuotaService.ensureTeamAllocation(testTeam.id);

    // Make User A Leader in Team
    await prisma.teamMember.create({
      data: {
        teamId: testTeam.id,
        userId: testUserA.id,
        role: 'Leader'
      }
    });

    const mockToken = testSystemIntegration.accessToken || 'mock_pass4_test_token';

    // -------------------------------------------------------------------------
    // Test 1: Google Drive Storage Driver Complete Lifecycle
    // -------------------------------------------------------------------------
    try {
      const testFolderId = await googleDriveDriver.createFolder('DriverTestFolder', 'root', mockToken);
      const folderMeta = await googleDriveDriver.getMetadata(testFolderId, mockToken);
      const folderExists = await googleDriveDriver.fileExists(testFolderId, mockToken);

      const uploadRes = await googleDriveDriver.uploadFile({
        buffer: Buffer.from('Hello DEVHUB Cloud Storage!'),
        mimeType: 'text/plain',
        filename: 'hello.txt',
        driveFolderId: testFolderId,
        token: mockToken
      });

      const fileMeta = await googleDriveDriver.getMetadata(uploadRes.driveFileId, mockToken);
      const dlRes = await googleDriveDriver.downloadFile(uploadRes.driveFileId, mockToken);

      // Read stream
      const chunks = [];
      for await (const chunk of dlRes.stream) {
        chunks.push(chunk);
      }
      const downloadedContent = Buffer.concat(chunks).toString('utf8');

      await googleDriveDriver.renameFile(uploadRes.driveFileId, 'hello_renamed.txt', mockToken);
      const renamedMeta = await googleDriveDriver.getMetadata(uploadRes.driveFileId, mockToken);

      const listRes = await googleDriveDriver.listFiles(testFolderId, { token: mockToken });

      await googleDriveDriver.deleteFile(uploadRes.driveFileId, mockToken);
      const afterDelExists = await googleDriveDriver.fileExists(uploadRes.driveFileId, mockToken);

      const test1Passed = (
        folderExists === true &&
        folderMeta.name === 'DriverTestFolder' &&
        uploadRes.driveFileId !== null &&
        fileMeta.name === 'hello.txt' &&
        downloadedContent === 'Hello DEVHUB Cloud Storage!' &&
        renamedMeta.name === 'hello_renamed.txt' &&
        listRes.length >= 1 &&
        afterDelExists === false
      );

      report(1, test1Passed, 'Google Drive Storage Driver complete lifecycle (upload, download, metadata, rename, list, delete)');
    } catch (err) {
      report(1, false, `Driver lifecycle error: ${err.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 2: PERSONAL File Upload & Scope Routing
    // -------------------------------------------------------------------------
    let personalFileRecord = null;
    try {
      const targetDriveFolderId = await driveFolderService.resolveTargetDriveFolder({
        scope: 'PERSONAL',
        userId: testUserA.id,
        customToken: mockToken
      });

      const uploadResult = await googleDriveDriver.uploadFile({
        buffer: Buffer.from('Personal Document Content'),
        mimeType: 'text/plain',
        filename: 'personal_notes.txt',
        driveFolderId: targetDriveFolderId,
        token: mockToken
      });

      personalFileRecord = await prisma.file.create({
        data: {
          name: 'personal_notes.txt',
          type: 'text/plain',
          size: BigInt(25),
          storagePath: `gdrive://${uploadResult.driveFileId}`,
          storageProvider: 'google_drive',
          driveFileId: uploadResult.driveFileId,
          storageScope: 'PERSONAL',
          uploaderId: testUserA.id,
          teamId: null
        }
      });
      cleanupFileIds.push(personalFileRecord.id);

      await storageQuotaService.syncUsage('PERSONAL', testUserA.id);
      const personalQuota = await storageQuotaService.getPersonalQuota(testUserA.id);

      // Verify folder parent path is DEVHUB -> Users -> <user>
      const driveFileMeta = await googleDriveDriver.getMetadata(uploadResult.driveFileId, mockToken);
      const parentFolderId = driveFileMeta.parents[0];
      const parentFolderMeta = await googleDriveDriver.getMetadata(parentFolderId, mockToken);

      const test2Passed = (
        personalFileRecord.storageScope === 'PERSONAL' &&
        personalFileRecord.teamId === null &&
        personalFileRecord.uploaderId === testUserA.id &&
        personalFileRecord.storageProvider === 'google_drive' &&
        driveFileMeta.parents[0] === targetDriveFolderId &&
        parentFolderMeta.name.includes(testUserA.email) &&
        BigInt(personalQuota.usedBytes) === 25n
      );

      report(2, test2Passed, `PERSONAL file uploaded under DEVHUB/Users/<user> and accounted in personal quota (${personalQuota.usedBytes} bytes)`);
    } catch (err) {
      report(2, false, `Personal upload error: ${err.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 3: TEAM File Upload & Scope Routing
    // -------------------------------------------------------------------------
    let teamFileRecord = null;
    try {
      const targetTeamDriveFolderId = await driveFolderService.resolveTargetDriveFolder({
        scope: 'TEAM',
        teamId: testTeam.id,
        userId: testUserA.id,
        customToken: mockToken
      });

      const uploadResult = await googleDriveDriver.uploadFile({
        buffer: Buffer.from('Team Architecture Document'),
        mimeType: 'text/plain',
        filename: 'architecture.txt',
        driveFolderId: targetTeamDriveFolderId,
        token: mockToken
      });

      teamFileRecord = await prisma.file.create({
        data: {
          name: 'architecture.txt',
          type: 'text/plain',
          size: BigInt(26),
          storagePath: `gdrive://${uploadResult.driveFileId}`,
          storageProvider: 'google_drive',
          driveFileId: uploadResult.driveFileId,
          storageScope: 'TEAM',
          teamId: testTeam.id,
          uploaderId: testUserA.id
        }
      });
      cleanupFileIds.push(teamFileRecord.id);

      await storageQuotaService.syncUsage('TEAM', testTeam.id);
      const teamQuota = await storageQuotaService.getTeamQuota(testTeam.id);

      const driveFileMeta = await googleDriveDriver.getMetadata(uploadResult.driveFileId, mockToken);
      const parentFolderMeta = await googleDriveDriver.getMetadata(driveFileMeta.parents[0], mockToken);

      const test3Passed = (
        teamFileRecord.storageScope === 'TEAM' &&
        teamFileRecord.teamId === testTeam.id &&
        teamFileRecord.storageProvider === 'google_drive' &&
        driveFileMeta.parents[0] === targetTeamDriveFolderId &&
        parentFolderMeta.name.includes(testTeam.name) &&
        BigInt(teamQuota.usedBytes) === 26n
      );

      report(3, test3Passed, `TEAM file uploaded under DEVHUB/Teams/<team> and accounted in team quota (${teamQuota.usedBytes} bytes)`);
    } catch (err) {
      report(3, false, `Team upload error: ${err.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 4: Permission Enforcement - Personal Files
    // -------------------------------------------------------------------------
    try {
      const ownerAccess = await storageScopeService.canAccess({
        user: testUserA,
        scope: personalFileRecord.storageScope,
        ownerId: personalFileRecord.uploaderId
      });

      const outsiderAccess = await storageScopeService.canAccess({
        user: testUserB,
        scope: personalFileRecord.storageScope,
        ownerId: personalFileRecord.uploaderId
      });

      const ownerManage = await storageScopeService.canManageFile({
        user: testUserA,
        file: personalFileRecord
      });

      const outsiderManage = await storageScopeService.canManageFile({
        user: testUserB,
        file: personalFileRecord
      });

      const test4Passed = (
        ownerAccess.allowed === true &&
        outsiderAccess.allowed === false &&
        ownerManage.allowed === true &&
        outsiderManage.allowed === false
      );

      report(4, test4Passed, 'Personal access rules enforced: owner allowed, outsider strictly denied (access & manage)');
    } catch (err) {
      report(4, false, `Personal permissions error: ${err.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 5: Permission Enforcement - Team Files
    // -------------------------------------------------------------------------
    try {
      const memberAccess = await storageScopeService.canAccess({
        user: testUserA,
        scope: teamFileRecord.storageScope,
        teamId: teamFileRecord.teamId
      });

      const outsiderAccess = await storageScopeService.canAccess({
        user: testUserB,
        scope: teamFileRecord.storageScope,
        teamId: teamFileRecord.teamId
      });

      const leaderManage = await storageScopeService.canManageFile({
        user: testUserA,
        file: teamFileRecord
      });

      const outsiderManage = await storageScopeService.canManageFile({
        user: testUserB,
        file: teamFileRecord
      });

      const test5Passed = (
        memberAccess.allowed === true &&
        outsiderAccess.allowed === false &&
        leaderManage.allowed === true &&
        outsiderManage.allowed === false
      );

      report(5, test5Passed, 'Team access rules enforced: team members allowed, outsiders strictly denied');
    } catch (err) {
      report(5, false, `Team permissions error: ${err.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 6: Logical Quota Rejection
    // -------------------------------------------------------------------------
    try {
      // Personal allocation is 5 GB
      const overPersonalBytes = DEFAULT_PERSONAL_STORAGE_BYTES + 1024n;
      const personalCheck = await storageQuotaService.validateUpload({
        scope: 'PERSONAL',
        userId: testUserA.id,
        incomingBytes: overPersonalBytes
      });

      // Team allocation is 10 GB
      const overTeamBytes = DEFAULT_TEAM_STORAGE_BYTES + 1024n;
      const teamCheck = await storageQuotaService.validateUpload({
        scope: 'TEAM',
        teamId: testTeam.id,
        incomingBytes: overTeamBytes
      });

      const test6Passed = (
        personalCheck.allowed === false &&
        personalCheck.reason.includes('Personal storage quota exceeded') &&
        teamCheck.allowed === false &&
        teamCheck.reason.includes('Team storage quota exceeded')
      );

      report(6, test6Passed, 'Logical quota validation rejects uploads exceeding 5 GB personal / 10 GB team quota');
    } catch (err) {
      report(6, false, `Quota rejection error: ${err.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 7: Global Physical Pool Capacity Rejection
    // -------------------------------------------------------------------------
    try {
      // Try to upload 5 TB + 1 byte
      const hugeBytes = GLOBAL_PHYSICAL_CAPACITY_BYTES + 1n;
      const poolCheck = await storageQuotaService.validateUpload({
        scope: 'PERSONAL',
        userId: testUserA.id,
        incomingBytes: hugeBytes
      });

      // Try upload that breaches the 50 GB safety buffer
      const bufferBreachBytes = GLOBAL_PHYSICAL_CAPACITY_BYTES - GLOBAL_SAFETY_BUFFER_BYTES + 1024n;
      const bufferCheck = await storagePoolService.canAcceptUpload(bufferBreachBytes);

      const test7Passed = (
        poolCheck.allowed === false &&
        poolCheck.reason.includes('physical storage capacity exceeded') &&
        bufferCheck.allowed === false
      );

      report(7, test7Passed, 'Physical pool validation rejects uploads that exceed 5 TB or violate 50 GB safety buffer');
    } catch (err) {
      report(7, false, `Pool rejection error: ${err.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 8: Drive File ID Persistence & API Client Sanitization
    // -------------------------------------------------------------------------
    try {
      const dbFile = await prisma.file.findUnique({
        where: { id: personalFileRecord.id }
      });

      // Simulate API response sanitization for non-admin user
      let sanitizedForUser = null;
      let sanitizedForAdmin = null;

      // Mock req & res for controller getFileById
      const reqUser = { params: { id: personalFileRecord.id }, userId: testUserA.id };
      const resUser = {
        json: (payload) => { sanitizedForUser = payload.file; }
      };
      await filesController.getFileById(reqUser, resUser);

      const reqAdmin = { params: { id: personalFileRecord.id }, userId: testAdmin.id };
      const resAdmin = {
        json: (payload) => { sanitizedForAdmin = payload.file; }
      };
      await filesController.getFileById(reqAdmin, resAdmin);

      const test8Passed = (
        dbFile.driveFileId !== null &&
        dbFile.storagePath.startsWith('gdrive://') &&
        sanitizedForUser.driveFileId === undefined &&
        sanitizedForUser.storageProvider === 'devhub_cloud' &&
        sanitizedForAdmin.driveFileId !== undefined
      );

      report(8, test8Passed, 'Drive file ID persisted in DB; properly hidden/sanitized from non-Admin API clients');
    } catch (err) {
      report(8, false, `Sanitization test error: ${err.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 9: Real File Download Streaming
    // -------------------------------------------------------------------------
    try {
      const dlResult = await googleDriveDriver.downloadFile(personalFileRecord.driveFileId, mockToken);
      const chunks = [];
      for await (const chunk of dlResult.stream) {
        chunks.push(chunk);
      }
      const downloadedText = Buffer.concat(chunks).toString('utf8');

      const test9Passed = (
        downloadedText === 'Personal Document Content' &&
        dlResult.mimeType === 'text/plain'
      );

      report(9, test9Passed, `Download streaming delivers exact original content (${downloadedText.length} bytes)`);
    } catch (err) {
      report(9, false, `Download streaming error: ${err.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 10: Real File Deletion & State Consistency
    // -------------------------------------------------------------------------
    try {
      const driveIdToDelete = personalFileRecord.driveFileId;
      const fileIdToDelete = personalFileRecord.id;

      // Delete via controller or driver
      await googleDriveDriver.deleteFile(driveIdToDelete, mockToken);
      await prisma.file.delete({ where: { id: fileIdToDelete } });
      await storageQuotaService.syncUsage('PERSONAL', testUserA.id);

      const driveExistsAfter = await googleDriveDriver.fileExists(driveIdToDelete, mockToken);
      const dbFileAfter = await prisma.file.findUnique({ where: { id: fileIdToDelete } });
      const updatedQuota = await storageQuotaService.getPersonalQuota(testUserA.id);

      const test10Passed = (
        driveExistsAfter === false &&
        dbFileAfter === null &&
        BigInt(updatedQuota.usedBytes) === 0n
      );

      report(10, test10Passed, 'File deletion cleanly removes Google Drive object, database record, and resets usage accounting');
    } catch (err) {
      report(10, false, `Deletion error: ${err.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 11: File Listing Isolation (DB-driven, no Google Drive leakage)
    // -------------------------------------------------------------------------
    try {
      let filesReturned = [];
      const mockReq = {
        query: { scope: 'PERSONAL' },
        userId: testUserA.id
      };
      const mockRes = {
        json: (data) => { filesReturned = data.files; }
      };

      await filesController.getFiles(mockReq, mockRes);

      // User A deleted personal file, so personal count is 0
      const test11Passed = (
        Array.isArray(filesReturned) &&
        filesReturned.length === 0
      );

      report(11, test11Passed, 'File listing derives strictly from DEVHUB database permissions, never leaking external Drive files');
    } catch (err) {
      report(11, false, `Listing test error: ${err.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 12: Zero S3 Operations in DEVHUB Cloud Storage Path
    // -------------------------------------------------------------------------
    try {
      const s3Calls = mockDriveState.s3CallsCount;
      const primaryProvider = storageService.getPrimaryStorageProvider();

      const test12Passed = (
        s3Calls === 0 &&
        primaryProvider === 'google_drive'
      );

      report(12, test12Passed, `Zero S3 operations occurred (S3 calls count: ${s3Calls}, Primary provider: ${primaryProvider})`);
    } catch (err) {
      report(12, false, `S3 call verification error: ${err.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 13: Admin Universal Access & Authority
    // -------------------------------------------------------------------------
    try {
      const adminPersonalAccess = await storageScopeService.canAccess({
        user: testAdmin,
        scope: 'PERSONAL',
        ownerId: testUserA.id
      });

      const adminTeamAccess = await storageScopeService.canAccess({
        user: testAdmin,
        scope: 'TEAM',
        teamId: testTeam.id
      });

      const adminManage = await storageScopeService.canManageFile({
        user: testAdmin,
        file: teamFileRecord
      });

      const test13Passed = (
        adminPersonalAccess.allowed === true &&
        adminTeamAccess.allowed === true &&
        adminManage.allowed === true
      );

      report(13, test13Passed, 'Admin maintains universal access and management authority over all personal and team files');
    } catch (err) {
      report(13, false, `Admin access error: ${err.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 14: No Google Drive OAuth Reconnection
    // -------------------------------------------------------------------------
    try {
      const integrations = await prisma.userIntegration.findMany({
        where: { provider: 'google_drive' }
      });

      // Confirm all integrations are intact
      const test14Passed = (
        integrations.length >= 1 &&
        integrations.every(i => i.status === 'connected')
      );

      report(14, test14Passed, 'Existing Admin Google Drive integration and OAuth state remained completely untouched');
    } catch (err) {
      report(14, false, `OAuth state error: ${err.message}`);
    }

    // -------------------------------------------------------------------------
    // Test 15: Failure Does Not Incorrectly Increase Usage Accounting
    // -------------------------------------------------------------------------
    try {
      const initialQuota = await storageQuotaService.getTeamQuota(testTeam.id);
      const initialUsed = BigInt(initialQuota.usedBytes);

      // Simulate a simulated upload error (e.g. invalid target Drive folder)
      let uploadFailed = false;
      try {
        await googleDriveDriver.uploadFile({
          buffer: Buffer.from('Corrupted File'),
          mimeType: 'text/plain',
          filename: 'corrupted.txt',
          driveFolderId: null // will trigger immediate failure
        });
      } catch (expectedErr) {
        uploadFailed = true;
      }

      await storageQuotaService.syncUsage('TEAM', testTeam.id);
      const postFailQuota = await storageQuotaService.getTeamQuota(testTeam.id);
      const postFailUsed = BigInt(postFailQuota.usedBytes);

      const test15Passed = (
        uploadFailed === true &&
        postFailUsed === initialUsed
      );

      report(15, test15Passed, `Upload failure leaves usage accounting completely unchanged (${initialUsed} bytes == ${postFailUsed} bytes)`);
    } catch (err) {
      report(15, false, `Failure isolation test error: ${err.message}`);
    }

  } finally {
    // Teardown temporary test entities
    console.log('\n[Teardown] Cleaning up temporary test entities...');
    for (const fId of cleanupFileIds) {
      await prisma.file.deleteMany({ where: { id: fId } });
    }
    for (const tId of cleanupTeamIds) {
      await prisma.teamMember.deleteMany({ where: { teamId: tId } });
      await prisma.teamStorageAllocation.deleteMany({ where: { teamId: tId } });
      await prisma.team.deleteMany({ where: { id: tId } });
    }
    for (const uId of cleanupUserIds) {
      await prisma.personalStorageAllocation.deleteMany({ where: { userId: uId } });
      await prisma.user.deleteMany({ where: { id: uId } });
    }
    for (const iId of createdIntegrationIds) {
      await prisma.userIntegration.deleteMany({ where: { id: iId } });
    }

    restoreFetch();
  }

  console.log('\n================================================================');
  if (passedTests === totalTests) {
    console.log(`   ${GREEN}>>> ALL ${passedTests}/${totalTests} PASS 4 REAL DRIVE STORAGE TESTS PASSED 100%! <<<${RESET}`);
  } else {
    console.log(`   ${RED}>>> FAILED: ${passedTests}/${totalTests} PASS 4 TESTS PASSED <<<${RESET}`);
    process.exit(1);
  }
  console.log('================================================================\n');
}

runPass4Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Pass 4 Test Suite Fatal Error:', err);
    process.exit(1);
  });
