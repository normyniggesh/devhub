require('dotenv').config();
const { Readable } = require('stream');
const prisma = require('./src/db');
const storageService = require('./src/services/storageService');
const filesController = require('./src/controllers/files');
const integrationsController = require('./src/controllers/integrations');

async function runStep3Tests() {
  console.log('================================================================');
  console.log('   STEP 3 TEST SUITE: GOOGLE DRIVE STORAGE DRIVER & ROUTING    ');
  console.log('================================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function report(name, passed, detail = '') {
    if (passed) {
      passedTests++;
      console.log(`  ✓ PASS: [Test ${name}] ${detail}`);
    } else {
      failedTests++;
      console.error(`  ❌ FAIL: [Test ${name}] ${detail}`);
    }
  }

  // --------------------------------------------------------------------------
  // TEST A: S3 provider still works
  // --------------------------------------------------------------------------
  console.log('\n--- Test A: S3 Provider Integrity ---');
  try {
    const hasS3Driver = Boolean(
      storageService.s3Driver &&
      typeof storageService.s3Driver.upload === 'function' &&
      typeof storageService.s3Driver.getDownloadUrl === 'function' &&
      typeof storageService.s3Driver.deleteFile === 'function'
    );
    report('A', hasS3Driver, 's3Driver methods (upload, getDownloadUrl, deleteFile) are present');
  } catch (err) {
    report('A', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST B: Provider selection defaults to S3
  // --------------------------------------------------------------------------
  console.log('\n--- Test B: Provider Selection Default ---');
  try {
    const origEnv = process.env.PRIMARY_STORAGE_PROVIDER;

    delete process.env.PRIMARY_STORAGE_PROVIDER;
    const defaultVal = storageService.getPrimaryStorageProvider();

    process.env.PRIMARY_STORAGE_PROVIDER = 'unknown_value';
    const fallbackVal = storageService.getPrimaryStorageProvider();

    process.env.PRIMARY_STORAGE_PROVIDER = 'google_drive';
    const gdriveVal = storageService.getPrimaryStorageProvider();

    process.env.PRIMARY_STORAGE_PROVIDER = origEnv || 's3';

    const passedB = defaultVal === 's3' && fallbackVal === 's3' && gdriveVal === 'google_drive';
    report('B', passedB, `Defaults to 's3' when unset/invalid, resolves 'google_drive' when set`);
  } catch (err) {
    report('B', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST C: Google Drive driver can be instantiated
  // --------------------------------------------------------------------------
  console.log('\n--- Test C: Google Drive Driver Instantiation ---');
  try {
    const gd = storageService.googleDriveDriver;
    const hasMethods = Boolean(
      gd &&
      typeof gd.upload === 'function' &&
      typeof gd.downloadStream === 'function' &&
      typeof gd.deleteFile === 'function' &&
      typeof gd.getAccessToken === 'function'
    );
    report('C', hasMethods, 'googleDriveDriver has upload, downloadStream, deleteFile, and getAccessToken');
  } catch (err) {
    report('C', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST D: Google Drive upload request construction is correct
  // --------------------------------------------------------------------------
  console.log('\n--- Test D: Google Drive Upload Request Construction ---');
  try {
    const origFetch = global.fetch;
    const origGetToken = storageService.googleDriveDriver.getAccessToken;

    let capturedUrl = null;
    let capturedOptions = null;

    storageService.googleDriveDriver.getAccessToken = async () => 'mock-system-token-12345';

    global.fetch = async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'gdrive-mock-file-999',
          name: 'project_architecture.png',
          size: '2048',
          mimeType: 'image/png'
        })
      };
    };

    const mockBuffer = Buffer.from('mock-png-binary-stream');
    const uploadRes = await storageService.googleDriveDriver.upload(
      mockBuffer,
      'image/png',
      'project_architecture.png',
      'gdrive-folder-target-777'
    );

    // Restore fetch and getAccessToken
    global.fetch = origFetch;
    storageService.googleDriveDriver.getAccessToken = origGetToken;

    const urlCorrect = capturedUrl.includes('drive/v3/files?uploadType=multipart');
    const authHeaderCorrect = capturedOptions.headers.Authorization === 'Bearer mock-system-token-12345';
    const contentTypeCorrect = capturedOptions.headers['Content-Type'].includes('multipart/related; boundary=');
    const bodyStr = capturedOptions.body.toString('utf8');
    const metadataCorrect = bodyStr.includes('"name":"project_architecture.png"') &&
                            bodyStr.includes('"parents":["gdrive-folder-target-777"]');
    const returnCorrect = uploadRes.driveFileId === 'gdrive-mock-file-999' &&
                          uploadRes.size === 2048n &&
                          uploadRes.mimeType === 'image/png';

    const passedD = urlCorrect && authHeaderCorrect && contentTypeCorrect && metadataCorrect && returnCorrect;
    report('D', passedD, 'Constructed valid multipart upload with parents, boundary, headers, and returned BigInt size');
  } catch (err) {
    report('D', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST E: Google Drive download routing is correct
  // --------------------------------------------------------------------------
  console.log('\n--- Test E: Google Drive Download Routing ---');
  try {
    const testUser = await prisma.user.findFirst();
    const testProject = await prisma.project.findFirst({ where: { ownerId: testUser.id } });

    // Create a mock Google Drive File record
    const mockDriveFile = await prisma.file.create({
      data: {
        name: 'cloud_spec.pdf',
        type: 'application/pdf',
        size: 1048576n,
        storagePath: 'gdrive://mock-drive-dl-444',
        storageProvider: 'google_drive',
        driveFileId: 'mock-drive-dl-444',
        projectId: testProject.id,
        uploaderId: testUser.id
      }
    });

    // 1. Test JSON response (client apiClient call)
    let jsonResult = null;
    const mockResJson = {
      json: (data) => { jsonResult = data; },
      status: (code) => ({ json: (d) => { jsonResult = { statusCode: code, ...d }; } }),
      setHeader: () => {}
    };

    await filesController.downloadFile(
      { params: { id: mockDriveFile.id }, query: {}, userId: testUser.id },
      mockResJson
    );

    const jsonRoutedCorrectly = jsonResult && jsonResult.success &&
      jsonResult.url === `/api/files/${mockDriveFile.id}/download?stream=true`;

    // 2. Test Stream response (?stream=true)
    const origDownloadStream = storageService.googleDriveDriver.downloadStream;
    let streamCalledWithId = null;

    storageService.googleDriveDriver.downloadStream = async (id) => {
      streamCalledWithId = id;
      const readable = new Readable();
      readable.push('MOCK_DRIVE_BINARY_DATA');
      readable.push(null);
      return {
        stream: readable,
        mimeType: 'application/pdf',
        name: 'cloud_spec.pdf',
        size: 22
      };
    };

    let streamHeaders = {};
    let pipedOutput = '';
    const mockResStream = {
      setHeader: (k, v) => { streamHeaders[k] = v; },
      write: (chunk) => { pipedOutput += chunk; },
      end: () => {}
    };

    const mockReqStream = {
      params: { id: mockDriveFile.id },
      query: { stream: 'true' },
      userId: testUser.id
    };

    // Use a mock response object that supports pipe
    const { PassThrough } = require('stream');
    const mockPassThrough = new PassThrough();
    mockPassThrough.setHeader = (k, v) => { streamHeaders[k] = v; };

    await filesController.downloadFile(mockReqStream, mockPassThrough);

    // Read streamed data
    let streamedData = '';
    for await (const chunk of mockPassThrough) {
      streamedData += chunk.toString();
    }

    storageService.googleDriveDriver.downloadStream = origDownloadStream;

    // Clean up mock file
    await prisma.file.delete({ where: { id: mockDriveFile.id } });

    const streamRoutedCorrectly = streamCalledWithId === 'mock-drive-dl-444' &&
                                  streamedData === 'MOCK_DRIVE_BINARY_DATA' &&
                                  streamHeaders['Content-Type'] === 'application/pdf';

    const passedE = jsonRoutedCorrectly && streamRoutedCorrectly;
    report('E', passedE, 'downloadFile routes to stream URL for client and streams binary when ?stream=true');
  } catch (err) {
    report('E', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST F: Google Drive delete routing is correct
  // --------------------------------------------------------------------------
  console.log('\n--- Test F: Google Drive Delete Routing ---');
  try {
    const testUser = await prisma.user.findFirst();
    const testProject = await prisma.project.findFirst({ where: { ownerId: testUser.id } });

    const mockDelFile = await prisma.file.create({
      data: {
        name: 'temp_to_delete.txt',
        type: 'text/plain',
        size: 512n,
        storagePath: 'gdrive://mock-del-file-555',
        storageProvider: 'google_drive',
        driveFileId: 'mock-del-file-555',
        projectId: testProject.id,
        uploaderId: testUser.id
      }
    });

    const origDeleteDrive = storageService.googleDriveDriver.deleteFile;
    const origDeleteS3 = storageService.s3Driver.deleteFile;

    let driveDeletedId = null;
    let s3DeleteCalled = false;

    storageService.googleDriveDriver.deleteFile = async (id) => {
      driveDeletedId = id;
      return true;
    };
    storageService.s3Driver.deleteFile = async () => {
      s3DeleteCalled = true;
    };

    let delResult = null;
    const mockResDel = {
      json: (d) => { delResult = d; },
      status: (code) => ({ json: (d) => { delResult = { statusCode: code, ...d }; } })
    };

    await filesController.deleteFile(
      { params: { id: mockDelFile.id }, userId: testUser.id },
      mockResDel
    );

    storageService.googleDriveDriver.deleteFile = origDeleteDrive;
    storageService.s3Driver.deleteFile = origDeleteS3;

    const dbRecordGone = !(await prisma.file.findUnique({ where: { id: mockDelFile.id } }));
    const passedF = delResult?.success && driveDeletedId === 'mock-del-file-555' && !s3DeleteCalled && dbRecordGone;

    report('F', passedF, 'deleteFile correctly calls googleDriveDriver.deleteFile without touching S3 driver');
  } catch (err) {
    report('F', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST G: Missing System Storage is handled correctly
  // --------------------------------------------------------------------------
  console.log('\n--- Test G: Missing System Storage Error Handling ---');
  try {
    // Temporarily deactivate system storage flag in DB to test error
    const sysIntegration = await prisma.userIntegration.findFirst({
      where: { provider: 'google_drive', metadata: { path: ['isSystemStorage'], equals: true } }
    });

    if (sysIntegration) {
      await prisma.userIntegration.update({
        where: { id: sysIntegration.id },
        data: { metadata: { ...sysIntegration.metadata, isSystemStorage: false } }
      });
    }

    let errorThrown = false;
    let errorMsg = '';
    try {
      await storageService.googleDriveDriver.getAccessToken();
    } catch (err) {
      errorThrown = true;
      errorMsg = err.message;
    }

    // Restore system storage flag if existed
    if (sysIntegration) {
      await prisma.userIntegration.update({
        where: { id: sysIntegration.id },
        data: { metadata: sysIntegration.metadata }
      });
    }

    const passedG = errorThrown && errorMsg.includes('Google Drive system storage is not configured or not connected');
    report('G', passedG, `Throws expected clear error without credential leakage: "${errorMsg}"`);
  } catch (err) {
    report('G', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST H: Missing driveFolderId is rejected for Google uploads
  // --------------------------------------------------------------------------
  console.log('\n--- Test H: Missing driveFolderId Rejection ---');
  try {
    const origEnv = process.env.PRIMARY_STORAGE_PROVIDER;
    process.env.PRIMARY_STORAGE_PROVIDER = 'google_drive';

    let uploadErrResult = null;
    const mockResUploadErr = {
      json: (d) => { uploadErrResult = d; },
      status: (code) => ({ json: (d) => { uploadErrResult = { statusCode: code, ...d }; } })
    };

    const testUser = await prisma.user.findFirst();
    const testProject = await prisma.project.findFirst({ where: { ownerId: testUser.id } });

    await filesController.uploadFiles(
      {
        body: { projectId: testProject.id }, // No driveFolderId and project has null driveFolderId
        files: [{ originalname: 'test.png', mimetype: 'image/png', size: 100, buffer: Buffer.from('123') }],
        userId: testUser.id
      },
      mockResUploadErr
    );

    process.env.PRIMARY_STORAGE_PROVIDER = origEnv || 's3';

    const passedH = uploadErrResult?.statusCode === 400 &&
                    uploadErrResult?.message === 'Google Drive target folder is not configured yet.';
    report('H', passedH, 'Rejects Google Drive upload with 400 "Google Drive target folder is not configured yet."');
  } catch (err) {
    report('H', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST I: Existing S3 File records still use S3
  // --------------------------------------------------------------------------
  console.log('\n--- Test I: Existing S3 File Record Routing ---');
  try {
    const s3File = await prisma.file.findFirst({
      where: { storageProvider: 's3' }
    });

    let s3Routed = false;
    if (s3File) {
      const origS3GetUrl = storageService.s3Driver.getDownloadUrl;
      storageService.s3Driver.getDownloadUrl = async (path) => {
        return `https://s3.amazonaws.com/mock-bucket/${path}`;
      };

      let dlResult = null;
      const mockRes = {
        json: (d) => { dlResult = d; },
        status: (c) => ({ json: (d) => { dlResult = { statusCode: c, ...d }; } })
      };

      await filesController.downloadFile(
        { params: { id: s3File.id }, query: {}, userId: s3File.uploaderId },
        mockRes
      );

      storageService.s3Driver.getDownloadUrl = origS3GetUrl;
      s3Routed = dlResult?.success && dlResult.url.includes('s3.amazonaws.com');
    }

    report('I', s3Routed, 'Existing S3 File records continue to route through S3 driver download');
  } catch (err) {
    report('I', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST J: Google Drive File records use driveFileId + storageProvider
  // --------------------------------------------------------------------------
  console.log('\n--- Test J: Google Drive File Schema & Record Attributes ---');
  try {
    const testUser = await prisma.user.findFirst();
    const testProject = await prisma.project.findFirst();

    const record = await prisma.file.create({
      data: {
        name: 'step3_spec_doc.pdf',
        type: 'application/pdf',
        size: 3000000000n, // 3 GB
        storagePath: 'gdrive://1a2b3c4d5e6f7g8h9i0',
        storageProvider: 'google_drive',
        driveFileId: '1a2b3c4d5e6f7g8h9i0',
        projectId: testProject.id,
        uploaderId: testUser.id
      }
    });

    const isDriveProvider = record.storageProvider === 'google_drive';
    const hasDriveFileId = record.driveFileId === '1a2b3c4d5e6f7g8h9i0';
    const hasBigIntSize = record.size === 3000000000n;

    // Check JSON serialization
    const jsonStr = JSON.stringify(record);
    const parsed = JSON.parse(jsonStr);
    const jsonSerializedCorrectly = parsed.size === 3000000000 &&
                                    parsed.storageProvider === 'google_drive' &&
                                    parsed.driveFileId === '1a2b3c4d5e6f7g8h9i0';

    await prisma.file.delete({ where: { id: record.id } });

    const passedJ = isDriveProvider && hasDriveFileId && hasBigIntSize && jsonSerializedCorrectly;
    report('J', passedJ, 'Record accurately stores and serializes driveFileId, storageProvider="google_drive", and 3GB BigInt size');
  } catch (err) {
    report('J', false, err.message);
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passedTests} passed, ${failedTests} failed.`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runStep3Tests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
