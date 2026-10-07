require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('./src/db');
const { encryptToken, decryptToken, sanitizeIntegration } = require('./src/utils/crypto');
const { getProvider, SUPPORTED_EXTERNAL_PROVIDERS } = require('./src/services/externalStorage');
const externalStorageService = require('./src/services/externalStorageService');
const storageQuotaService = require('./src/services/storageQuotaService');
const storagePoolService = require('./src/services/storagePoolService');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key';

async function runPass10Tests() {
  console.log('========================================================================');
  console.log('   PASS 10 TEST SUITE: PERSONAL EXTERNAL CLOUD STORAGE INTEGRATIONS    ');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message, detail = '') {
    if (condition) {
      passed++;
      console.log(`  ✓ PASS: ${message}`);
      if (detail) console.log(`         ${detail}`);
    } else {
      failed++;
      console.error(`  ❌ FAIL: ${message}`);
      if (detail) console.error(`         ${detail}`);
    }
  }

  // Record Admin System Storage pre-test state
  const preIntegrations = await prisma.userIntegration.findMany({
    where: { provider: 'google_drive' }
  });
  const adminSystemStorage = preIntegrations.find(i => i.metadata && i.metadata.isSystemStorage === true);
  console.log(`[Pre-Flight] Admin System Storage detected: ${adminSystemStorage ? adminSystemStorage.accountName : 'None (Mocked)'}`);

  // Setup Isolated Test Users
  const uniqueId = Date.now();
  const userA = await prisma.user.create({
    data: {
      email: `user_a_pass10_${uniqueId}@devhub.test`,
      name: 'Pass10 User A',
      passwordHash: 'dummy_hash',
      role: 'Member',
      emailVerified: true
    }
  });

  const userB = await prisma.user.create({
    data: {
      email: `user_b_pass10_${uniqueId}@devhub.test`,
      name: 'Pass10 User B',
      passwordHash: 'dummy_hash',
      role: 'Member',
      emailVerified: true
    }
  });

  const team = await prisma.team.create({
    data: {
      name: `Pass10 Team ${uniqueId}`,
      createdById: userA.id
    }
  });

  await prisma.teamMember.create({
    data: {
      teamId: team.id,
      userId: userA.id,
      role: 'Leader'
    }
  });

  const userAToken = jwt.sign({ userId: userA.id }, JWT_SECRET, { expiresIn: '1h' });
  const userBToken = jwt.sign({ userId: userB.id }, JWT_SECRET, { expiresIn: '1h' });

  // Initialize express app
  const app = require('./src/app');
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    // --------------------------------------------------------------------------
    // TEST 1: Provider Abstraction & Registry
    // --------------------------------------------------------------------------
    console.log('\n--- Test 1: Provider Abstraction & Registry ---');
    const gdriveAdapter = getProvider('google_drive');
    const dropboxAdapter = getProvider('dropbox');
    const onedriveAdapter = getProvider('onedrive');

    assert(
      gdriveAdapter && gdriveAdapter.name === 'google_drive',
      'GoogleDrivePersonalProvider registered and implements provider adapter'
    );
    assert(
      dropboxAdapter && dropboxAdapter.name === 'dropbox',
      'DropboxProvider registered and implements provider adapter'
    );
    assert(
      onedriveAdapter && onedriveAdapter.name === 'onedrive',
      'OneDriveProvider registered and implements provider adapter'
    );
    assert(
      SUPPORTED_EXTERNAL_PROVIDERS.length === 3 &&
      SUPPORTED_EXTERNAL_PROVIDERS.includes('google_drive') &&
      SUPPORTED_EXTERNAL_PROVIDERS.includes('dropbox') &&
      SUPPORTED_EXTERNAL_PROVIDERS.includes('onedrive'),
      'Strictly limited to Google Drive, Dropbox, and OneDrive (no extra providers)'
    );

    // --------------------------------------------------------------------------
    // TEST 2: Personal Google Drive Connection Separation
    // --------------------------------------------------------------------------
    console.log('\n--- Test 2: Personal Google Drive Connection Separation ---');
    // Save personal Google Drive integration for User A
    const mockPersonalGdriveToken = 'ya29.mock_personal_google_token_user_a';
    const encryptedGdriveToken = encryptToken(mockPersonalGdriveToken);

    await prisma.userIntegration.create({
      data: {
        userId: userA.id,
        provider: 'google_drive',
        status: 'connected',
        accountName: 'usera.personal@gmail.com',
        accessToken: encryptedGdriveToken,
        metadata: {
          email: 'usera.personal@gmail.com',
          refreshToken: encryptToken('1//mock_refresh_token_a'),
          isSystemStorage: false // CRITICAL: personal external storage
        }
      }
    });

    const userAGdrive = await prisma.userIntegration.findFirst({
      where: { userId: userA.id, provider: 'google_drive' }
    });

    assert(
      userAGdrive && userAGdrive.metadata.isSystemStorage === false,
      'User A Google Drive is strictly personal (isSystemStorage === false)'
    );
    if (adminSystemStorage) {
      const refreshedAdminSys = await prisma.userIntegration.findUnique({
        where: { id: adminSystemStorage.id }
      });
      assert(
        refreshedAdminSys.metadata.isSystemStorage === true,
        'Admin System Storage connection remains untouched and active as DEVHUB Cloud backend'
      );
    }

    // --------------------------------------------------------------------------
    // TEST 3: Personal Dropbox Connection Separation & Encryption
    // --------------------------------------------------------------------------
    console.log('\n--- Test 3: Personal Dropbox Connection Separation & Encryption ---');
    const mockDropboxToken = 'sl.mock_dropbox_user_a_secret_token';
    const encDropbox = encryptToken(mockDropboxToken);

    assert(
      encDropbox.startsWith('enc:') && encDropbox !== mockDropboxToken,
      'Token encrypted with AES-256-GCM before storage'
    );
    assert(
      decryptToken(encDropbox) === mockDropboxToken,
      'Token successfully decrypted via secure configuration pattern'
    );

    await prisma.userIntegration.create({
      data: {
        userId: userA.id,
        provider: 'dropbox',
        status: 'connected',
        accountName: 'usera@dropbox.com',
        accessToken: encDropbox,
        metadata: {
          email: 'usera@dropbox.com',
          isSystemStorage: false
        }
      }
    });

    const userADropbox = await prisma.userIntegration.findFirst({
      where: { userId: userA.id, provider: 'dropbox' }
    });
    assert(
      userADropbox && userADropbox.accessToken.startsWith('enc:'),
      'Dropbox token is encrypted at rest in the database'
    );

    // --------------------------------------------------------------------------
    // TEST 4: Personal OneDrive Connection Separation
    // --------------------------------------------------------------------------
    console.log('\n--- Test 4: Personal OneDrive Connection Separation ---');
    const mockOnedriveToken = 'EwBoA_mock_onedrive_user_a_token';
    const encOnedrive = encryptToken(mockOnedriveToken);

    await prisma.userIntegration.create({
      data: {
        userId: userA.id,
        provider: 'onedrive',
        status: 'connected',
        accountName: 'usera@outlook.com',
        accessToken: encOnedrive,
        metadata: {
          email: 'usera@outlook.com',
          isSystemStorage: false
        }
      }
    });

    const userAOnedrive = await prisma.userIntegration.findFirst({
      where: { userId: userA.id, provider: 'onedrive' }
    });
    assert(
      userAOnedrive && userAOnedrive.metadata.isSystemStorage === false,
      'User A OneDrive is strictly personal external storage'
    );

    // --------------------------------------------------------------------------
    // TEST 5: User Isolation (User A cannot access User B integration)
    // --------------------------------------------------------------------------
    console.log('\n--- Test 5: Strict User Isolation (User A vs User B) ---');
    // User B tries to query connected integrations
    const userBIntRes = await fetch(`${baseUrl}/integrations`, {
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    const userBIntData = await userBIntRes.json();

    assert(
      userBIntRes.ok && userBIntData.success === true,
      'GET /api/integrations responds successfully for User B'
    );
    assert(
      userBIntData.integrations.google_drive.connected === false &&
      userBIntData.integrations.dropbox.connected === false &&
      userBIntData.integrations.onedrive.connected === false,
      'User B sees zero connected integrations (cannot access User A accounts)'
    );

    // User B tries to list files from dropbox (which User A connected)
    const userBListRes = await fetch(`${baseUrl}/integrations/dropbox/files`, {
      headers: { Authorization: `Bearer ${userBToken}` }
    });
    const userBListData = await userBListRes.json();

    assert(
      userBListRes.status === 400 && userBListData.success === false,
      'User B is blocked from listing User A Dropbox files with "not connected" error'
    );

    // --------------------------------------------------------------------------
    // TEST 6: OAuth Tokens Never Exposed in API Responses
    // --------------------------------------------------------------------------
    console.log('\n--- Test 6: Zero Exposure of OAuth Tokens ---');
    const userAIntRes = await fetch(`${baseUrl}/integrations`, {
      headers: { Authorization: `Bearer ${userAToken}` }
    });
    const userAIntRaw = await userAIntRes.text();
    const userAIntJson = JSON.parse(userAIntRaw);

    assert(
      !userAIntRaw.includes(mockPersonalGdriveToken) &&
      !userAIntRaw.includes(mockDropboxToken) &&
      !userAIntRaw.includes(mockOnedriveToken),
      'Plaintext tokens never appear in API responses'
    );
    assert(
      !userAIntRaw.includes('enc:'),
      'Encrypted tokens never appear in API responses'
    );
    assert(
      userAIntJson.integrations.google_drive.hasToken === true &&
      !userAIntJson.integrations.google_drive.accessToken &&
      !userAIntJson.integrations.google_drive.metadata?.refreshToken,
      'Tokens sanitized cleanly: hasToken flag is true, accessToken and refreshToken stripped'
    );

    // --------------------------------------------------------------------------
    // TEST 7: External Browsing & Downloads Do NOT Affect DEVHUB Quota or 5 TB Pool
    // --------------------------------------------------------------------------
    console.log('\n--- Test 7: Quota Separation & Physical Pool Preservation ---');
    const initialPersonalQuota = await storageQuotaService.getPersonalQuota(userA.id);
    const initialPool = await storagePoolService.getPoolStatus();

    // Mock download via external provider adapter directly
    const originalDownload = gdriveAdapter.downloadFile;
    const testFileBuffer = Buffer.from('external_cloud_test_file_content_12345');
    gdriveAdapter.downloadFile = async () => ({
      buffer: testFileBuffer,
      name: 'external_readme.txt',
      mimeType: 'text/plain',
      size: testFileBuffer.length
    });

    // User A downloads external file directly via endpoint
    const dlRes = await fetch(`${baseUrl}/integrations/google_drive/download/mock_ext_file_1`, {
      headers: { Authorization: `Bearer ${userAToken}` }
    });

    assert(
      dlRes.ok,
      'Direct download from external provider succeeds'
    );

    const postDlQuota = await storageQuotaService.getPersonalQuota(userA.id);
    const postDlPool = await storagePoolService.getPoolStatus();

    assert(
      postDlQuota.usedBytes === initialPersonalQuota.usedBytes,
      'External browsing & downloading consumes 0 bytes of DEVHUB Cloud quota'
    );
    assert(
      postDlPool.usedBytes === initialPool.usedBytes,
      'External browsing & downloading does not affect 5 TB physical pool'
    );

    // --------------------------------------------------------------------------
    // TEST 8: Importing External File into DEVHUB Cloud Correctly Updates Quota
    // --------------------------------------------------------------------------
    console.log('\n--- Test 8: Import Behavior & DEVHUB Quota Attribution ---');
    // Mock googleDriveDriver.upload and driveFolderService.resolveTargetDriveFolder so we don't make real network calls
    const googleDriveDriver = require('./src/services/googleDriveDriver');
    const driveFolderService = require('./src/services/driveFolderService');
    const originalDriverUpload = googleDriveDriver.upload;
    const originalResolveFolder = driveFolderService.resolveTargetDriveFolder;
    googleDriveDriver.upload = async (buffer, mimeType, name, folderId) => {
      return {
        driveFileId: `mock_imported_drive_${Date.now()}`,
        name,
        size: buffer.length
      };
    };
    driveFolderService.resolveTargetDriveFolder = async () => 'mock_admin_folder_target_id';

    const importRes = await fetch(`${baseUrl}/integrations/google_drive/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userAToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileId: 'mock_ext_file_1',
        fileName: 'imported_report.txt',
        targetScope: 'PERSONAL'
      })
    });

    const importData = await importRes.json();
    assert(
      importRes.status === 201 && importData.success === true,
      'External file imported into DEVHUB Cloud Storage'
    );
    assert(
      importData.file.storageScope === 'PERSONAL' &&
      importData.file.storageProvider === 'google_drive' &&
      importData.file.uploaderId === userA.id,
      'Imported file stored in Admin System Storage (google_drive backend) with PERSONAL scope'
    );

    const postImportQuota = await storageQuotaService.getPersonalQuota(userA.id);
    assert(
      Number(postImportQuota.usedBytes) === testFileBuffer.length,
      `User A DEVHUB quota correctly increased by imported file size (${testFileBuffer.length} bytes)`
    );

    // Import into TEAM storage
    const teamImportRes = await fetch(`${baseUrl}/integrations/google_drive/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userAToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileId: 'mock_ext_file_1',
        fileName: 'team_report.txt',
        targetScope: 'TEAM',
        teamId: team.id
      })
    });
    const teamImportData = await teamImportRes.json();
    assert(
      teamImportRes.status === 201 && teamImportData.file.storageScope === 'TEAM',
      'External file imported into TEAM storage'
    );

    const teamQuota = await storageQuotaService.getTeamQuota(team.id);
    assert(
      Number(teamQuota.usedBytes) === testFileBuffer.length,
      'Team quota correctly increased by imported file size'
    );

    // Restore driver upload
    googleDriveDriver.upload = originalDriverUpload;
    driveFolderService.resolveTargetDriveFolder = originalResolveFolder;
    gdriveAdapter.downloadFile = originalDownload;

    // --------------------------------------------------------------------------
    // TEST 9: Disconnect Safety
    // --------------------------------------------------------------------------
    console.log('\n--- Test 9: Disconnect Safety ---');
    // User A disconnects Dropbox
    const discRes = await fetch(`${baseUrl}/integrations/disconnect`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userAToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ provider: 'dropbox' })
    });
    const discData = await discRes.json();

    assert(
      discRes.ok && discData.success === true,
      'POST /api/integrations/disconnect succeeds'
    );

    const checkDropbox = await prisma.userIntegration.findFirst({
      where: { userId: userA.id, provider: 'dropbox' }
    });
    assert(
      checkDropbox === null,
      'User A Dropbox integration removed safely'
    );

    const checkGdriveStillExists = await prisma.userIntegration.findFirst({
      where: { userId: userA.id, provider: 'google_drive' }
    });
    assert(
      checkGdriveStillExists !== null,
      'Other integrations of User A remain intact'
    );

    // Verify imported files in DEVHUB were NOT deleted
    const importedFile = await prisma.file.findFirst({
      where: { id: importData.file.id }
    });
    assert(
      importedFile !== null,
      'DEVHUB Cloud files remain untouched and intact after external disconnect'
    );

    // Disconnect Safety: Attempting to disconnect system storage via personal disconnect must be blocked
    if (adminSystemStorage) {
      try {
        await externalStorageService.disconnectIntegration({
          userId: adminSystemStorage.userId,
          provider: 'google_drive'
        });
        failed++;
        console.error('  ❌ FAIL: Disconnect should have blocked disconnecting System Storage');
      } catch (err) {
        passed++;
        console.log('  ✓ PASS: Disconnect safely blocked disconnecting Admin System Storage from personal endpoint');
      }
    }

    // --------------------------------------------------------------------------
    // TEST 10: Zero S3 Operations
    // --------------------------------------------------------------------------
    console.log('\n--- Test 10: Zero S3 Operations Verification ---');
    const allPass10Files = await prisma.file.findMany({
      where: { uploaderId: userA.id }
    });
    const s3Files = allPass10Files.filter(f => f.storageProvider === 's3');
    assert(
      s3Files.length === 0,
      `Zero files created with storageProvider === 's3' (total: ${allPass10Files.length}, S3: ${s3Files.length})`
    );

  } finally {
    server.close();

    // Cleanup isolated test resources
    console.log('\n[Cleanup] Cleaning up isolated test resources...');
    await prisma.file.deleteMany({ where: { uploaderId: { in: [userA.id, userB.id] } } });
    await prisma.userIntegration.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.teamMember.deleteMany({ where: { teamId: team.id } });
    await prisma.teamStorageAllocation.deleteMany({ where: { teamId: team.id } });
    await prisma.personalStorageAllocation.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.team.deleteMany({ where: { id: team.id } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });

    console.log('\n========================================================================');
    console.log(`PASS 10 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  }
}

runPass10Tests().catch(err => {
  console.error('Fatal error in Pass 10 tests:', err);
  process.exit(1);
});
