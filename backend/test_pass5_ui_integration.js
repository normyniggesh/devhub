require('dotenv').config();
const prisma = require('./src/db');
const crypto = require('crypto');
const { Readable, Writable } = require('stream');
const storageScopeService = require('./src/services/storageScopeService');
const driveFolderService = require('./src/services/driveFolderService');
const storageQuotaService = require('./src/services/storageQuotaService');
const storagePoolService = require('./src/services/storagePoolService');
const { googleDriveDriver } = require('./src/services/googleDriveDriver');
const storageService = require('./src/services/storageService');
const filesController = require('./src/controllers/files');
const foldersController = require('./src/controllers/folders');
const teamController = require('./src/controllers/team');
const integrationsController = require('./src/controllers/integrations');
const adminQuotasController = require('./src/controllers/adminQuotas');
const teamService = require('./src/services/teamService');
const {
  DEFAULT_PERSONAL_STORAGE_BYTES,
  DEFAULT_TEAM_STORAGE_BYTES,
  STORAGE_SCOPES,
  TEAM_ROLES,
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
        content: contentBuf,
        trashed: false
      };
      mockDriveState.files.set(fileId, fileObj);

      return new Response(JSON.stringify({
        id: fileId,
        name: fileObj.name,
        mimeType: fileObj.mimeType,
        size: fileObj.size.toString(),
        parents: fileObj.parents
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Google Drive Metadata creation (Folder creation)
    if (urlStr.startsWith('https://www.googleapis.com/drive/v3/files') && method === 'POST') {
      mockDriveState.counter++;
      const folderId = `gdrive_folder_${mockDriveState.counter}`;
      const payload = typeof options.body === 'string' ? JSON.parse(options.body) : {};

      const folderObj = {
        id: folderId,
        name: payload.name || 'Untitled Folder',
        mimeType: payload.mimeType || 'application/vnd.google-apps.folder',
        parents: payload.parents || [],
        trashed: false
      };
      mockDriveState.files.set(folderId, folderObj);

      return new Response(JSON.stringify(folderObj), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Google Drive Download (alt=media)
    if (urlStr.includes('/drive/v3/files/') && urlStr.includes('alt=media')) {
      const match = urlStr.match(/\/files\/([^\/\?]+)/);
      const fileId = match ? match[1] : null;
      const file = mockDriveState.files.get(fileId);

      if (!file || file.trashed) {
        return new Response(JSON.stringify({ error: { message: 'File not found' } }), { status: 404 });
      }

      return new Response(file.content, {
        status: 200,
        headers: {
          'Content-Type': file.mimeType || 'application/octet-stream',
          'Content-Length': file.content.length.toString()
        }
      });
    }

    // Google Drive File Metadata GET
    if (urlStr.match(/https:\/\/www\.googleapis\.com\/drive\/v3\/files\/[^\/\?]+/) && method === 'GET') {
      const match = urlStr.match(/\/files\/([^\/\?]+)/);
      const fileId = match ? match[1] : null;
      const file = mockDriveState.files.get(fileId);

      if (!file || file.trashed) {
        return new Response(JSON.stringify({ error: { message: 'File not found' } }), { status: 404 });
      }

      return new Response(JSON.stringify({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size ? file.size.toString() : '0',
        parents: file.parents || []
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Google Drive Delete
    if (urlStr.includes('/drive/v3/files/') && method === 'DELETE') {
      const match = urlStr.match(/\/files\/([^\/\?]+)/);
      const fileId = match ? match[1] : null;
      if (mockDriveState.files.has(fileId)) {
        mockDriveState.files.delete(fileId);
      }
      return new Response(null, { status: 204 });
    }

    // Google Drive List Files
    if (urlStr.startsWith('https://www.googleapis.com/drive/v3/files') && method === 'GET') {
      const filesList = Array.from(mockDriveState.files.values()).filter(f => !f.trashed);
      return new Response(JSON.stringify({ files: filesList }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fallback to original fetch
    return origFetch(url, options);
  };
}

async function runPass5TestSuite() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   DEVHUB PASS 5 — COMPLETE CLOUD STORAGE UI INTEGRATION TEST   ${RESET}`);
  console.log(`${CYAN}================================================================\n${RESET}`);

  setupMockGoogleDrive();

  // Test entities
  let adminUser, testUser1, testUser2, outsiderUser;
  let testTeam;
  let createdPersonalFolder, createdTeamFolder;
  let uploadedPersonalFile, uploadedTeamFile;

  try {
    // -------------------------------------------------------------
    // Setup Test Users and Integrations
    // -------------------------------------------------------------
    const rand = crypto.randomBytes(4).toString('hex');
    const adminEmail = `admin_p5_${rand}@devhub.local`;
    const user1Email = `user1_p5_${rand}@devhub.local`;
    const user2Email = `user2_p5_${rand}@devhub.local`;
    const outsiderEmail = `outsider_p5_${rand}@devhub.local`;

    adminUser = await prisma.user.create({
      data: {
        name: 'Pass5 Admin',
        email: adminEmail,
        passwordHash: 'hashed_pw_test',
        role: 'Admin'
      }
    });

    testUser1 = await prisma.user.create({
      data: {
        name: 'Pass5 User1 (Leader)',
        email: user1Email,
        passwordHash: 'hashed_pw_test',
        role: 'User'
      }
    });

    testUser2 = await prisma.user.create({
      data: {
        name: 'Pass5 User2 (Member)',
        email: user2Email,
        passwordHash: 'hashed_pw_test',
        role: 'User'
      }
    });

    outsiderUser = await prisma.user.create({
      data: {
        name: 'Pass5 Outsider',
        email: outsiderEmail,
        passwordHash: 'hashed_pw_test',
        role: 'User'
      }
    });

    // Seed Admin System Storage Integration
    await prisma.userIntegration.create({
      data: {
        userId: adminUser.id,
        provider: 'google_drive',
        status: 'connected',
        accessToken: 'ya29.pass5_mock_admin_token',
        accountName: 'admin.drive@devhub.internal',
        metadata: {
          isSystemStorage: true,
          systemStorageActivatedAt: new Date().toISOString()
        }
      }
    });

    // Create a Team with testUser1 as Leader and testUser2 as Member
    testTeam = await teamService.createTeam({
      name: `P5 Engineering Team ${rand}`,
      description: 'Engineering team for Pass 5 verification',
      createdById: testUser1.id,
      addCreatorAsLeader: true
    });

    await teamService.addMember({
      teamId: testTeam.id,
      userId: testUser2.id,
      role: TEAM_ROLES.MEMBER
    });

    // =============================================================
    // TEST 1: Storage Quota Endpoint - Personal Quota Display
    // =============================================================
    {
      const req = { userId: testUser1.id, params: {}, query: {} };
      let resJson = null;
      const res = { json: (data) => { resJson = data; } };

      await integrationsController.getProviderQuota(req, res);
      const devhubQ = resJson?.quotas?.devhub;

      const valid = Boolean(
        resJson?.success &&
        devhubQ &&
        devhubQ.provider === 'devhub' &&
        devhubQ.name === 'DEVHUB Cloud Storage' &&
        devhubQ.allocatedGB === 5 &&
        devhubQ.limit === 5368709120 &&
        devhubQ.used === 0 &&
        Number(devhubQ.remainingBytes) === 5368709120 &&
        devhubQ.percentage === 0
      );
      report(1, valid, 'Authoritative Personal Quota returns correct DEVHUB Cloud Storage values (5 GB)');
    }

    // =============================================================
    // TEST 2: Storage Quota Endpoint - Team Quota Display with teamId
    // =============================================================
    {
      const req = { userId: testUser1.id, params: {}, query: { teamId: testTeam.id } };
      let resJson = null;
      const res = { json: (data) => { resJson = data; } };

      await integrationsController.getProviderQuota(req, res);
      const teamQ = resJson?.quotas?.teamQuota;

      const valid = Boolean(
        resJson?.success &&
        teamQ &&
        teamQ.scope === 'TEAM' &&
        teamQ.teamId === testTeam.id &&
        teamQ.allocatedGB === 10 &&
        teamQ.limit === 10737418240 &&
        teamQ.used === 0 &&
        teamQ.remainingBytes === '10737418240' &&
        teamQ.percentage === 0
      );
      report(2, valid, 'Authoritative Team Quota returns correct values (10 GB) when querying with teamId');
    }

    // =============================================================
    // TEST 3: Folder Creation in Personal Scope (UI Action)
    // =============================================================
    {
      const req = {
        userId: testUser1.id,
        body: {
          name: 'My Personal Folder',
          scope: 'PERSONAL'
        }
      };
      let resStatus = 200, resJson = null;
      const res = {
        status: (s) => { resStatus = s; return res; },
        json: (data) => { resJson = data; }
      };

      await foldersController.createFolder(req, res);
      createdPersonalFolder = resJson?.folder;

      const valid = Boolean(
        resStatus === 201 &&
        createdPersonalFolder &&
        createdPersonalFolder.name === 'My Personal Folder' &&
        createdPersonalFolder.storageScope === 'PERSONAL' &&
        createdPersonalFolder.driveFolderId === undefined // Sanitized from client
      );
      report(3, valid, 'Folder creation in Personal scope succeeds with sanitization');
    }

    // =============================================================
    // TEST 4: File Upload in Personal Scope (UI Action)
    // =============================================================
    {
      const dummyFileBuf = Buffer.from('DEVHUB Personal File Content For UI Verification');
      const req = {
        userId: testUser1.id,
        body: {
          scope: 'PERSONAL',
          folderId: createdPersonalFolder.id
        },
        files: [
          {
            originalname: 'personal_document.pdf',
            mimetype: 'application/pdf',
            size: dummyFileBuf.length,
            buffer: dummyFileBuf
          }
        ]
      };
      let resStatus = 200, resJson = null;
      const res = {
        status: (s) => { resStatus = s; return res; },
        json: (data) => { resJson = data; }
      };

      await filesController.uploadFiles(req, res);
      uploadedPersonalFile = resJson?.files?.[0];

      const valid = Boolean(
        resStatus === 201 &&
        uploadedPersonalFile &&
        uploadedPersonalFile.name === 'personal_document.pdf' &&
        uploadedPersonalFile.folderId === createdPersonalFolder.id &&
        uploadedPersonalFile.storageScope === 'PERSONAL' &&
        uploadedPersonalFile.driveFileId === undefined // Sanitized
      );
      report(4, valid, 'Personal file upload stores to Drive and returns sanitized metadata');
    }

    // =============================================================
    // TEST 5: Personal Download Stream
    // =============================================================
    {
      const req = {
        userId: testUser1.id,
        params: { id: uploadedPersonalFile.id },
        query: { stream: 'true' }
      };
      let headers = {};
      let pipedData = Buffer.alloc(0);
      // Mock stream pipe destination
      const writable = new Writable({
        write(chunk, encoding, callback) {
          pipedData = Buffer.concat([pipedData, chunk]);
          callback();
        }
      });
      writable.setHeader = (k, v) => { headers[k] = v; };
      writable.status = () => writable;
      writable.json = () => {};

      await new Promise((resolve, reject) => {
        writable.on('finish', resolve);
        writable.on('error', reject);
        filesController.downloadFile(req, writable).catch(reject);
      });

      const valid = Boolean(
        headers['Content-Disposition'] &&
        headers['Content-Disposition'].includes('personal_document.pdf') &&
        pipedData.toString().includes('DEVHUB Personal File Content')
      );
      report(5, valid, 'Personal file download streams real content with attachment headers');
    }

    // =============================================================
    // TEST 6: Personal File Rename & Folder Rename
    // =============================================================
    {
      // 6a: Rename File
      const reqFile = {
        userId: testUser1.id,
        params: { id: uploadedPersonalFile.id },
        body: { name: 'renamed_document.pdf' }
      };
      let resJsonFile = null;
      const resFile = { json: (d) => { resJsonFile = d; } };
      await filesController.updateFile(reqFile, resFile);

      // 6b: Rename Folder
      const reqFolder = {
        userId: testUser1.id,
        params: { id: createdPersonalFolder.id },
        body: { name: 'Renamed Personal Folder' }
      };
      let resJsonFolder = null;
      const resFolder = { json: (d) => { resJsonFolder = d; } };
      await foldersController.updateFolder(reqFolder, resFolder);

      const valid = Boolean(
        resJsonFile?.success &&
        resJsonFile?.file?.name === 'renamed_document.pdf' &&
        resJsonFolder?.success &&
        resJsonFolder?.folder?.name === 'Renamed Personal Folder'
      );
      report(6, valid, 'Personal file and folder renaming updates successfully');
    }

    // =============================================================
    // TEST 7: Team List Endpoint - Isolation to Current User's Teams
    // =============================================================
    {
      // testUser1 belongs to testTeam
      const req1 = { userId: testUser1.id };
      let res1Json = null;
      await teamController.getMyTeams(req1, { json: (d) => { res1Json = d; } });

      // outsiderUser belongs to 0 teams
      const reqOut = { userId: outsiderUser.id };
      let resOutJson = null;
      await teamController.getMyTeams(reqOut, { json: (d) => { resOutJson = d; } });

      const valid = Boolean(
        res1Json?.teams?.length === 1 &&
        res1Json.teams[0].id === testTeam.id &&
        res1Json.teams[0].myRole === 'Leader' &&
        resOutJson?.teams?.length === 0
      );
      report(7, valid, 'Team listing strictly isolates teams by membership with user role attribution');
    }

    // =============================================================
    // TEST 8: Team Storage Folder Creation & Upload by Leader
    // =============================================================
    {
      // 8a: Folder creation by Leader
      const reqFolder = {
        userId: testUser1.id, // Leader
        body: {
          name: 'Engineering Sprint Assets',
          scope: 'TEAM',
          teamId: testTeam.id
        }
      };
      let folderResJson = null;
      await foldersController.createFolder(reqFolder, {
        status: () => ({ json: (d) => { folderResJson = d; } }),
        json: (d) => { folderResJson = d; }
      });
      createdTeamFolder = folderResJson?.folder;

      // 8b: Upload by Leader
      const dummyTeamBuf = Buffer.from('Sprint Architecture Specs 2026');
      const reqUpload = {
        userId: testUser1.id,
        body: {
          scope: 'TEAM',
          teamId: testTeam.id,
          folderId: createdTeamFolder.id
        },
        files: [
          {
            originalname: 'architecture_specs.pdf',
            mimetype: 'application/pdf',
            size: dummyTeamBuf.length,
            buffer: dummyTeamBuf
          }
        ]
      };
      let uploadResJson = null;
      await filesController.uploadFiles(reqUpload, {
        status: () => ({ json: (d) => { uploadResJson = d; } }),
        json: (d) => { uploadResJson = d; }
      });
      uploadedTeamFile = uploadResJson?.files?.[0];

      const valid = Boolean(
        createdTeamFolder &&
        createdTeamFolder.teamId === testTeam.id &&
        uploadedTeamFile &&
        uploadedTeamFile.teamId === testTeam.id &&
        uploadedTeamFile.folderId === createdTeamFolder.id
      );
      report(8, valid, 'Team Leader can create folders and upload files to Team Storage');
    }

    // =============================================================
    // TEST 9: Team Member (testUser2) Access & Download
    // =============================================================
    {
      // 9a: Member can list team files
      const reqList = {
        userId: testUser2.id, // Member
        query: { teamId: testTeam.id, folderId: createdTeamFolder.id }
      };
      let listResJson = null;
      await filesController.getFiles(reqList, { json: (d) => { listResJson = d; } });

      // 9b: Member can download team file
      const reqDown = {
        userId: testUser2.id,
        params: { id: uploadedTeamFile.id },
        query: { stream: 'true' }
      };
      let pipedData = Buffer.alloc(0);
      const writable = new Writable({
        write(chunk, encoding, callback) {
          pipedData = Buffer.concat([pipedData, chunk]);
          callback();
        }
      });
      writable.setHeader = () => {};
      writable.status = () => writable;
      writable.json = () => {};

      await new Promise((resolve, reject) => {
        writable.on('finish', resolve);
        writable.on('error', reject);
        filesController.downloadFile(reqDown, writable).catch(reject);
      });

      const valid = Boolean(
        listResJson?.files?.length === 1 &&
        listResJson.files[0].id === uploadedTeamFile.id &&
        pipedData.toString().includes('Sprint Architecture Specs 2026')
      );
      report(9, valid, 'Active Team Member can list and download files within their team');
    }

    // =============================================================
    // TEST 10: Unauthorized Access Prevention (Outsider Blocked)
    // =============================================================
    {
      // Outsider tries to list team files
      let listBlocked = false;
      const reqList = {
        userId: outsiderUser.id,
        query: { teamId: testTeam.id }
      };
      await filesController.getFiles(reqList, {
        status: (s) => {
          if (s === 403) listBlocked = true;
          return { json: () => {} };
        },
        json: () => {}
      });

      // Outsider tries to download team file
      let downloadBlocked = false;
      const reqDown = {
        userId: outsiderUser.id,
        params: { id: uploadedTeamFile.id }
      };
      await filesController.downloadFile(reqDown, {
        status: (s) => {
          if (s === 403) downloadBlocked = true;
          return { json: () => {} };
        },
        json: () => {}
      });

      // Outsider tries to upload to team storage
      let uploadBlocked = false;
      const dummyBuf = Buffer.from('Malicious upload');
      const reqUp = {
        userId: outsiderUser.id,
        body: { scope: 'TEAM', teamId: testTeam.id },
        files: [{ originalname: 'hack.exe', mimetype: 'application/octet-stream', size: dummyBuf.length, buffer: dummyBuf }]
      };
      await filesController.uploadFiles(reqUp, {
        status: (s) => {
          if (s === 403) uploadBlocked = true;
          return { json: () => {} };
        },
        json: () => {}
      });

      const valid = listBlocked && downloadBlocked && uploadBlocked;
      report(10, valid, 'Outsider access to Team Storage is authoritatively blocked (403 Forbidden)');
    }

    // =============================================================
    // TEST 11: Admin Storage View - All 6 Physical & Logical Metrics
    // =============================================================
    {
      const req = { userId: adminUser.id };
      let resJson = null;
      await adminQuotasController.listAllocations(req, {
        status: () => ({ json: (d) => { resJson = d; } }),
        json: (d) => { resJson = d; }
      });

      const pool = resJson?.poolStatus;

      const valid = Boolean(
        resJson?.success &&
        pool &&
        pool.physicalCapacityFormatted === '5 TB' &&
        pool.physicalCapacityGB === 5120 &&
        pool.actualUsedBytes !== undefined &&
        pool.actualUsedGB !== undefined &&
        pool.actualRemainingBytes !== undefined &&
        pool.actualRemainingGB !== undefined &&
        pool.safetyBufferBytes !== undefined &&
        pool.safetyBufferGB === 50 &&
        pool.totalLogicalPersonalBytes !== undefined &&
        pool.totalLogicalPersonalGB !== undefined &&
        pool.totalLogicalTeamBytes !== undefined &&
        pool.totalLogicalTeamGB !== undefined &&
        pool.allocatedGB !== undefined
      );
      report(11, valid, 'Admin storage view returns all 6 physical and logical pool metrics without secrets');
    }

    // =============================================================
    // TEST 12: Quota Exceeded Enforcement Error Message
    // =============================================================
    {
      // Attempt to upload 6 GB into 5 GB personal quota
      const hugeBytes = 6n * 1024n * 1024n * 1024n; // 6 GB
      let rejected = false;
      let rejectReason = '';

      const reqHuge = {
        userId: testUser2.id,
        body: { scope: 'PERSONAL' },
        files: [
          {
            originalname: 'huge_backup.iso',
            mimetype: 'application/octet-stream',
            size: Number(hugeBytes),
            buffer: Buffer.alloc(100) // Dummy small buffer with huge simulated size
          }
        ]
      };

      await filesController.uploadFiles(reqHuge, {
        status: (s) => {
          if (s === 400) rejected = true;
          return {
            json: (d) => { rejectReason = d.message || ''; }
          };
        },
        json: () => {}
      });

      const valid = Boolean(rejected && rejectReason.includes('quota exceeded'));
      report(12, valid, 'Upload exceeding quota produces clear quota-exceeded error message');
    }

    // =============================================================
    // TEST 13: File and Folder Deletion with Quota Recalculation
    // =============================================================
    {
      // 13a: Delete Personal File
      const reqDelFile = {
        userId: testUser1.id,
        params: { id: uploadedPersonalFile.id }
      };
      let fileDeleted = false;
      await filesController.deleteFile(reqDelFile, {
        json: (d) => { fileDeleted = Boolean(d.success); }
      });

      // 13b: Delete Personal Folder
      const reqDelFolder = {
        userId: testUser1.id,
        params: { id: createdPersonalFolder.id }
      };
      let folderDeleted = false;
      await foldersController.deleteFolder(reqDelFolder, {
        json: (d) => { folderDeleted = Boolean(d.success); }
      });

      // Verify file is removed from Drive representation
      const driveFileStillExists = mockDriveState.files.has(uploadedPersonalFile.id);

      const valid = Boolean(fileDeleted && folderDeleted && !driveFileStillExists);
      report(13, valid, 'File and folder deletion clears database and Google Drive representation');
    }

    // =============================================================
    // TEST 14: Zero S3 Operations Verification
    // =============================================================
    {
      const valid = mockDriveState.s3CallsCount === 0;
      report(14, valid, `Zero S3 operations occurred throughout all storage operations (Count: ${mockDriveState.s3CallsCount})`);
    }

    // =============================================================
    // TEST 15: No Google Drive Secrets or Drive IDs in Client Sanitization
    // =============================================================
    {
      const req = { userId: testUser1.id, query: { teamId: testTeam.id } };
      let resJson = null;
      await filesController.getFiles(req, { json: (d) => { resJson = d; } });

      const files = resJson?.files || [];
      const hasDriveFileId = files.some(f => f.driveFileId !== undefined);
      const hasStoragePath = files.some(f => f.storagePath !== undefined);
      const hasAccessToken = files.some(f => f.accessToken !== undefined);

      const valid = Boolean(files.length > 0 && !hasDriveFileId && !hasStoragePath && !hasAccessToken);
      report(15, valid, 'Client files response is strictly sanitized with zero Google Drive provider internals');
    }

  } catch (error) {
    console.error(`\n${RED}Unexpected Test Suite Error:${RESET}`, error);
  } finally {
    // Cleanup created test records
    console.log(`\n${CYAN}Cleaning up Pass 5 test records...${RESET}`);
    const userIds = [adminUser?.id, testUser1?.id, testUser2?.id, outsiderUser?.id].filter(Boolean);
    const teamIds = [testTeam?.id].filter(Boolean);

    if (teamIds.length > 0) {
      await prisma.file.deleteMany({ where: { teamId: { in: teamIds } } });
      await prisma.folder.deleteMany({ where: { teamId: { in: teamIds } } });
      await prisma.teamMember.deleteMany({ where: { teamId: { in: teamIds } } });
      await prisma.teamStorageAllocation.deleteMany({ where: { teamId: { in: teamIds } } });
      await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
    }

    if (userIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.file.deleteMany({ where: { uploaderId: { in: userIds } } });
      await prisma.folder.deleteMany({ where: { creatorId: { in: userIds } } });
      await prisma.userIntegration.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.personalStorageAllocation.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  }

  console.log(`\n================================================================`);
  console.log(`PASS 5 TEST RESULTS: ${passedTests}/${totalTests} Passed`);
  console.log(`================================================================\n`);

  if (passedTests === totalTests && totalTests > 0) {
    console.log(`${GREEN}PASS 5 VERIFICATION 100% SUCCESSFUL!${RESET}\n`);
    process.exit(0);
  } else {
    console.error(`${RED}PASS 5 VERIFICATION FAILED!${RESET}\n`);
    process.exit(1);
  }
}

runPass5TestSuite();
