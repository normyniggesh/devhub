require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const prisma = require('./src/db');
const storageService = require('./src/services/storageService');
const driveFolderService = require('./src/services/driveFolderService');
const filesController = require('./src/controllers/files');

// In-memory Mock Google Drive API Simulator
class MockGoogleDrive {
  constructor() {
    this.files = new Map();
    this.nextId = 1;
    this.createCallCount = 0;
    this.searchCallCount = 0;
  }

  reset() {
    this.files.clear();
    this.nextId = 1;
    this.createCallCount = 0;
    this.searchCallCount = 0;
  }

  async handleFetch(url, options = {}) {
    const parsedUrl = new URL(url);
    const method = options.method || 'GET';
    const reqPath = parsedUrl.pathname;

    // 1. Files list / search: /drive/v3/files?q=...
    if (reqPath === '/drive/v3/files' && method === 'GET') {
      this.searchCallCount++;
      const q = parsedUrl.searchParams.get('q') || '';
      
      const nameMatch = q.match(/name\s*=\s*'([^']+)'/);
      const parentMatch = q.match(/'([^']+)'\s*in\s*parents/);
      const mimeMatch = q.match(/mimeType\s*=\s*'([^']+)'/);

      const targetName = nameMatch ? nameMatch[1] : null;
      const targetParent = parentMatch ? parentMatch[1] : null;
      const targetMime = mimeMatch ? mimeMatch[1] : null;

      const matching = [];
      for (const file of this.files.values()) {
        if (file.trashed) continue;
        if (targetName && file.name !== targetName) continue;
        if (targetParent && !file.parents.includes(targetParent)) continue;
        if (targetMime && file.mimeType !== targetMime) continue;
        matching.push(file);
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ files: matching })
      };
    }

    // 2. Folder creation: POST /drive/v3/files
    if (reqPath === '/drive/v3/files' && method === 'POST') {
      this.createCallCount++;
      const body = JSON.parse(options.body || '{}');
      const cleanName = (body.name || 'folder').replace(/[^a-zA-Z0-9]/g, '_');
      const id = `gdrive_folder_${this.nextId++}_${cleanName}`;
      const newFolder = {
        id,
        name: body.name,
        parents: body.parents || ['root'],
        mimeType: body.mimeType || 'application/vnd.google-apps.folder',
        trashed: false
      };
      this.files.set(id, newFolder);
      return {
        ok: true,
        status: 200,
        json: async () => newFolder
      };
    }

    // 3. File metadata/get: GET /drive/v3/files/<id>
    const fileIdMatch = reqPath.match(/^\/drive\/v3\/files\/([^/?]+)$/);
    if (fileIdMatch && method === 'GET') {
      const fileId = decodeURIComponent(fileIdMatch[1]);
      const file = this.files.get(fileId);
      if (!file) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { message: 'File not found', code: 404 } })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => file
      };
    }

    return {
      ok: false,
      status: 400,
      json: async () => ({ error: { message: `Unhandled mock endpoint: ${reqPath}` } })
    };
  }
}

async function runStep4Tests() {
  console.log('================================================================');
  console.log('   STEP 4 TEST SUITE: GOOGLE DRIVE FOLDER HIERARCHY             ');
  console.log('================================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function report(num, passed, detail = '') {
    if (passed) {
      passedTests++;
      console.log(`  ✓ PASS: [Test ${num}] ${detail}`);
    } else {
      failedTests++;
      console.error(`  ❌ FAIL: [Test ${num}] ${detail}`);
    }
  }

  const mockDrive = new MockGoogleDrive();
  const origFetch = global.fetch;
  const origGetToken = storageService.googleDriveDriver.getAccessToken;

  // Track created test entities for guaranteed cleanup
  const cleanupEntities = {
    folderIds: [],
    projectIds: []
  };

  try {
    // Install mock fetch and token provider for drive operations
    storageService.googleDriveDriver.getAccessToken = async () => 'mock-system-token-step4';
    global.fetch = async (url, options) => {
      if (typeof url === 'string' && url.includes('googleapis.com')) {
        return await mockDrive.handleFetch(url, options);
      }
      return await origFetch(url, options);
    };

    // --------------------------------------------------------------------------
    // Test 1: System Storage missing -> controlled error
    // --------------------------------------------------------------------------
    console.log('\n--- Test 1: System Storage Missing -> Controlled Error ---');
    try {
      const sysInt = await prisma.userIntegration.findFirst({
        where: { provider: 'google_drive', metadata: { path: ['isSystemStorage'], equals: true } }
      });

      if (sysInt) {
        await prisma.userIntegration.update({
          where: { id: sysInt.id },
          data: { metadata: { ...sysInt.metadata, isSystemStorage: false } }
        });
      }

      let errorThrown = false;
      let errorMsg = '';
      try {
        await driveFolderService.ensureDriveRoot();
      } catch (err) {
        errorThrown = true;
        errorMsg = err.message;
      }

      // Restore system storage flag
      if (sysInt) {
        await prisma.userIntegration.update({
          where: { id: sysInt.id },
          data: { metadata: sysInt.metadata }
        });
      }

      const passed1 = errorThrown && errorMsg.includes('Google Drive system storage is not configured or not connected');
      report(1, passed1, `Rejects gracefully with controlled error: "${errorMsg}"`);
    } catch (err) {
      report(1, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 2: DEVHUB root creation
    // --------------------------------------------------------------------------
    console.log('\n--- Test 2: DEVHUB Root Creation ---');
    let rootDriveId = null;
    try {
      mockDrive.reset();
      rootDriveId = await driveFolderService.ensureDriveRoot();

      const createdFolder = mockDrive.files.get(rootDriveId);
      const isDevhubRoot = createdFolder && createdFolder.name === 'DEVHUB' && createdFolder.parents.includes('root');
      
      // Verify saved in UserIntegration metadata
      const sysIntegration = await prisma.userIntegration.findFirst({
        where: { provider: 'google_drive', metadata: { path: ['isSystemStorage'], equals: true } }
      });
      const savedInDb = sysIntegration?.metadata?.driveRootFolderId === rootDriveId;

      const passed2 = !!rootDriveId && isDevhubRoot && savedInDb;
      report(2, passed2, `DEVHUB root created with id=${rootDriveId} under 'root' and persisted in UserIntegration metadata`);
    } catch (err) {
      report(2, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 3: Repeated root provisioning does not create duplicates
    // --------------------------------------------------------------------------
    console.log('\n--- Test 3: Repeated Root Provisioning Does Not Duplicate ---');
    try {
      const initialCount = mockDrive.createCallCount;
      const secondRootId = await driveFolderService.ensureDriveRoot();

      const isSameId = secondRootId === rootDriveId;
      const noNewFolderCreated = mockDrive.createCallCount === initialCount;

      const passed3 = isSameId && noNewFolderCreated;
      report(3, passed3, `Reused existing root ID (${secondRootId}) without creating duplicate folder in Google Drive`);
    } catch (err) {
      report(3, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 4: Project folder creation
    // --------------------------------------------------------------------------
    console.log('\n--- Test 4: Project Folder Creation ---');
    let testProject = null;
    let projectDriveId = null;
    try {
      const testUser = await prisma.user.findFirst();
      testProject = await prisma.project.create({
        data: {
          name: 'Step4 Alpha Project',
          ownerId: testUser.id,
          driveFolderId: null
        }
      });
      cleanupEntities.projectIds.push(testProject.id);

      projectDriveId = await driveFolderService.ensureProjectDriveFolder(testProject.id);

      // Verify Project Drive Folder created
      const projDriveFolder = mockDrive.files.get(projectDriveId);
      const projNameMatches = projDriveFolder && projDriveFolder.name === 'Step4 Alpha Project';

      // Verify Parent is 'Team' folder under 'DEVHUB' root
      const teamFolderId = projDriveFolder ? projDriveFolder.parents[0] : null;
      const teamDriveFolder = mockDrive.files.get(teamFolderId);
      const isTeamFolder = teamDriveFolder && teamDriveFolder.name === 'Team' && teamDriveFolder.parents.includes(rootDriveId);

      const passed4 = !!projectDriveId && projNameMatches && isTeamFolder;
      report(4, passed4, `Created hierarchy: DEVHUB(${rootDriveId}) -> Team(${teamFolderId}) -> Project(${projectDriveId})`);
    } catch (err) {
      report(4, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 5: Repeated project provisioning does not create duplicates
    // --------------------------------------------------------------------------
    console.log('\n--- Test 5: Repeated Project Provisioning Does Not Duplicate ---');
    try {
      const createCountBefore = mockDrive.createCallCount;
      const secondProjDriveId = await driveFolderService.ensureProjectDriveFolder(testProject.id);

      const isSameProjId = secondProjDriveId === projectDriveId;
      const noNewFolder = mockDrive.createCallCount === createCountBefore;

      const passed5 = isSameProjId && noNewFolder;
      report(5, passed5, `Reused existing project ID (${secondProjDriveId}) with 0 new folders created`);
    } catch (err) {
      report(5, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 6: Folder mapping (DEVHUB Folder record -> Google Drive)
    // --------------------------------------------------------------------------
    console.log('\n--- Test 6: Folder Mapping ---');
    let parentFolder = null;
    let parentFolderDriveId = null;
    try {
      const testUser = await prisma.user.findFirst();
      parentFolder = await prisma.folder.create({
        data: {
          name: 'Architecture Documents',
          projectId: testProject.id,
          parentId: null,
          driveFolderId: null,
          creatorId: testUser.id
        }
      });
      cleanupEntities.folderIds.push(parentFolder.id);

      parentFolderDriveId = await driveFolderService.ensureDevhubDriveFolder(parentFolder.id);

      const folderDrive = mockDrive.files.get(parentFolderDriveId);
      const folderMatches = folderDrive && folderDrive.name === 'Architecture Documents' &&
                            folderDrive.parents.includes(projectDriveId);

      const passed6 = !!parentFolderDriveId && folderMatches;
      report(6, passed6, `Mapped DEVHUB Folder "Architecture Documents" directly under Project folder (${projectDriveId})`);
    } catch (err) {
      report(6, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 7: Nested folder mapping (Folder.parentId support)
    // --------------------------------------------------------------------------
    console.log('\n--- Test 7: Nested Folder Mapping ---');
    let childFolder = null;
    let childFolderDriveId = null;
    try {
      const testUser = await prisma.user.findFirst();
      childFolder = await prisma.folder.create({
        data: {
          name: 'Database Diagrams',
          projectId: testProject.id,
          parentId: parentFolder.id,
          driveFolderId: null,
          creatorId: testUser.id
        }
      });
      cleanupEntities.folderIds.push(childFolder.id);

      childFolderDriveId = await driveFolderService.ensureDevhubDriveFolder(childFolder.id);

      const childDrive = mockDrive.files.get(childFolderDriveId);
      const nestedCorrectly = childDrive && childDrive.name === 'Database Diagrams' &&
                              childDrive.parents.includes(parentFolderDriveId);

      const passed7 = !!childFolderDriveId && nestedCorrectly;
      report(7, passed7, `Mapped nested folder "Database Diagrams" under parent folder ID (${parentFolderDriveId})`);
    } catch (err) {
      report(7, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 8: Existing project/folder records without Drive IDs remain valid
    // --------------------------------------------------------------------------
    console.log('\n--- Test 8: Existing Records Without Drive IDs Remain Valid ---');
    try {
      const testUser = await prisma.user.findFirst();
      const legacyProject = await prisma.project.create({
        data: {
          name: 'Legacy Project Without Drive ID',
          ownerId: testUser.id,
          driveFolderId: null
        }
      });
      cleanupEntities.projectIds.push(legacyProject.id);

      const legacyFolder = await prisma.folder.create({
        data: {
          name: 'Legacy Unmapped Folder',
          projectId: legacyProject.id,
          parentId: null,
          driveFolderId: null,
          creatorId: testUser.id
        }
      });
      cleanupEntities.folderIds.push(legacyFolder.id);

      // Verify Prisma queries work completely normally with null driveFolderId
      const fetchedProj = await prisma.project.findUnique({
        where: { id: legacyProject.id },
        include: { folders: true }
      });

      const passed8 = fetchedProj && fetchedProj.driveFolderId === null &&
                      fetchedProj.folders.length === 1 &&
                      fetchedProj.folders[0].driveFolderId === null;
      report(8, passed8, 'Projects and Folders with null driveFolderId query and operate flawlessly');
    } catch (err) {
      report(8, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 9: Correct driveFolderId values are stored in PostgreSQL
    // --------------------------------------------------------------------------
    console.log('\n--- Test 9: Correct driveFolderId Stored in PostgreSQL ---');
    try {
      const refreshedProject = await prisma.project.findUnique({ where: { id: testProject.id } });
      const refreshedParentFolder = await prisma.folder.findUnique({ where: { id: parentFolder.id } });
      const refreshedChildFolder = await prisma.folder.findUnique({ where: { id: childFolder.id } });

      const projStored = refreshedProject.driveFolderId === projectDriveId;
      const parentStored = refreshedParentFolder.driveFolderId === parentFolderDriveId;
      const childStored = refreshedChildFolder.driveFolderId === childFolderDriveId;

      const passed9 = projStored && parentStored && childStored;
      report(9, passed9, `PostgreSQL records verified: Project=${refreshedProject.driveFolderId}, ParentFolder=${refreshedParentFolder.driveFolderId}, ChildFolder=${refreshedChildFolder.driveFolderId}`);
    } catch (err) {
      report(9, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 10: No unrelated Drive folder is selected
    // --------------------------------------------------------------------------
    console.log('\n--- Test 10: No Unrelated Drive Folder Is Selected ---');
    try {
      // Inject unrelated folders into mock Google Drive
      mockDrive.files.set('unrelated_1', {
        id: 'unrelated_1',
        name: 'Personal Family Photos',
        parents: ['root'],
        mimeType: 'application/vnd.google-apps.folder',
        trashed: false
      });
      mockDrive.files.set('unrelated_2', {
        id: 'unrelated_2',
        name: 'DEVHUB',
        parents: ['another_external_parent_999'], // named DEVHUB but wrong parent
        mimeType: 'application/vnd.google-apps.folder',
        trashed: false
      });

      // Search for DEVHUB root
      const foundRoot = await driveFolderService.findDriveFolder('DEVHUB', 'root');
      const foundPersonal = await driveFolderService.findDriveFolder('Personal Family Photos', rootDriveId);

      const passed10 = foundRoot === rootDriveId && foundPersonal === null;
      report(10, passed10, `Queries strictly isolate by name AND parentId ('root'), never selecting unrelated or external folders`);
    } catch (err) {
      report(10, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 11: Existing S3 storage behavior remains unchanged
    // --------------------------------------------------------------------------
    console.log('\n--- Test 11: Existing S3 Storage Behavior Remains Unchanged ---');
    try {
      const primary = storageService.getPrimaryStorageProvider();
      const s3Valid = Boolean(
        storageService.s3Driver &&
        typeof storageService.s3Driver.upload === 'function' &&
        typeof storageService.s3Driver.getDownloadUrl === 'function' &&
        typeof storageService.s3Driver.deleteFile === 'function'
      );
      const testKey = storageService.generateSafeKey('proj1', 'fold1', 'report.pdf');
      const keyValid = testKey.startsWith('projects/proj1/folders/fold1/') && testKey.endsWith('report.pdf');

      const passed11 = primary === 's3' && s3Valid && keyValid;
      report(11, passed11, `PRIMARY_STORAGE_PROVIDER is "${primary}", S3 driver intact, and S3 safe keys generate normally`);
    } catch (err) {
      report(11, false, err.message);
    }

    // --------------------------------------------------------------------------
    // Test 12: Step 1, Step 2, and Step 3 tests still pass
    // --------------------------------------------------------------------------
    console.log('\n--- Test 12: Step 1, Step 2, and Step 3 Tests Still Pass ---');
    try {
      // Temporarily restore real fetch to execute test scripts
      global.fetch = origFetch;
      storageService.googleDriveDriver.getAccessToken = origGetToken;

      console.log('    Running Step 1 tests...');
      execSync('node test_step1_gdrive_auth.js', { cwd: __dirname, stdio: 'pipe' });

      console.log('    Running Step 2 verification...');
      execSync('node verify_step2_compatibility.js', { cwd: __dirname, stdio: 'pipe' });

      console.log('    Running Step 3 tests...');
      execSync('node test_step3_storage_driver.js', { cwd: __dirname, stdio: 'pipe' });

      report(12, true, 'All prior test suites (Step 1, Step 2, Step 3) passed with exit code 0');
    } catch (err) {
      report(12, false, `Prior test suite failure: ${err.message}`);
    }

    // --------------------------------------------------------------------------
    // Test 13: Frontend build still passes
    // --------------------------------------------------------------------------
    console.log('\n--- Test 13: Frontend Build Still Passes ---');
    try {
      const frontendDir = path.resolve(__dirname, '../frontend');
      console.log('    Running frontend production build (npm run build)...');
      execSync('npm run build', { cwd: frontendDir, stdio: 'pipe' });
      report(13, true, 'Frontend build compiled cleanly with 0 errors');
    } catch (err) {
      report(13, false, `Frontend build failed: ${err.message}`);
    }

    // --------------------------------------------------------------------------
    // Task 9: Real Owner Drive Verification (Controlled Probe)
    // --------------------------------------------------------------------------
    console.log('\n================================================================');
    console.log('   TASK 9: REAL OWNER DRIVE VERIFICATION PROBE                  ');
    console.log('================================================================');
    try {
      const sysIntegration = await prisma.userIntegration.findFirst({
        where: { provider: 'google_drive', metadata: { path: ['isSystemStorage'], equals: true } }
      });

      const refreshToken = sysIntegration?.metadata?.refreshToken;
      const isMockToken = !refreshToken || refreshToken.startsWith('mock_');

      if (isMockToken) {
        console.log('  [PROBE RESULT] Real Google Drive authorization is pending.');
        console.log('  Reason: System Storage account ("owner.5tb@gmail.com") currently holds simulated test credentials.');
        console.log('  Live OAuth grant with scope https://www.googleapis.com/auth/drive.file has not yet been executed in production.');
        console.log('  Status: PENDING_LIVE_OAUTH (as instructed by Task 9 specifications).');
      } else {
        console.log('  [PROBE] Real refresh token detected. Attempting live Drive connection...');
        const rootId = await driveFolderService.ensureDriveRoot();
        console.log(`  ✓ LIVE SUCCESS: DEVHUB root verified in live Google Drive. ID: ${rootId}`);
      }
    } catch (probeErr) {
      console.log(`  [PROBE RESULT] Real verification pending or failed: ${probeErr.message}`);
    }

  } finally {
    // Restore original globals
    global.fetch = origFetch;
    storageService.googleDriveDriver.getAccessToken = origGetToken;

    // Cleanup created test records
    for (const folderId of cleanupEntities.folderIds) {
      await prisma.folder.delete({ where: { id: folderId } }).catch(() => {});
    }
    for (const projectId of cleanupEntities.projectIds) {
      await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    }

    await prisma.$disconnect();
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passedTests} passed, ${failedTests} failed.`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runStep4Tests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
