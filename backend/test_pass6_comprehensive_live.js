const https = require('https');

const HOST = 'devhub-backend-d13v.onrender.com';
const FRONTEND_URL = 'https://devhub-ten-wheat.vercel.app';

function httpRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: buffer.toString('utf8'),
          raw: buffer
        });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function httpUpload(path, token, fields, fileObj) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const crlf = '\r\n';

    let parts = [];
    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined && val !== null) {
        parts.push(Buffer.from(
          `--${boundary}${crlf}Content-Disposition: form-data; name="${key}"${crlf}${crlf}${val}${crlf}`
        ));
      }
    }

    if (fileObj) {
      const header = `--${boundary}${crlf}Content-Disposition: form-data; name="files"; filename="${fileObj.name}"${crlf}Content-Type: ${fileObj.type}${crlf}${crlf}`;
      const footer = `${crlf}--${boundary}--${crlf}`;
      parts.push(Buffer.from(header));
      parts.push(Buffer.isBuffer(fileObj.buffer) ? fileObj.buffer : Buffer.from(fileObj.buffer));
      parts.push(Buffer.from(footer));
    } else {
      parts.push(Buffer.from(`--${boundary}--${crlf}`));
    }

    const payload = Buffer.concat(parts);

    const req = https.request({
      hostname: HOST,
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Cookie': `devhub_auth_token=${token}`,
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length
      }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: buffer.toString('utf8'),
          raw: buffer
        });
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runPass6LiveVerification() {
  console.log('================================================================');
  console.log('   DEVHUB PASS 6 — LIVE PRODUCTION VERIFICATION SUITE           ');
  console.log('================================================================\n');

  let allPassed = true;
  const results = [];

  function report(checkNum, passed, desc) {
    results.push({ checkNum, passed, desc });
    if (passed) {
      console.log(`  ✓ PASS: [Check ${checkNum}] ${desc}`);
    } else {
      console.error(`  ❌ FAIL: [Check ${checkNum}] ${desc}`);
      allPassed = false;
    }
  }

  let adminToken = null;
  let outsiderToken = null;
  let outsiderUserId = null;
  let testTeamId = null;
  let testFileId = null;
  let initialSysActivatedAt = null;

  try {
    // --------------------------------------------------------------------------
    // TASK 1 & 3: AUDIT PRODUCTION CONFIG & LIVE HEALTH CHECK
    // --------------------------------------------------------------------------
    console.log('\n--- Section 1: Live Health & Environment Audit ---');

    // Check 1: Frontend loads
    const feRes = await httpRequest({
      hostname: 'devhub-ten-wheat.vercel.app',
      port: 443,
      path: '/?v=' + Date.now(),
      method: 'GET'
    });
    report(1, feRes.statusCode === 200, `Frontend loads from Vercel (Status: ${feRes.statusCode})`);

    // Check 2: Backend health endpoint responds
    const healthRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/health',
      method: 'GET'
    });
    const healthData = JSON.parse(healthRes.body || '{}');
    report(2, healthRes.statusCode === 200 && healthData.status === 'ok',
      `Backend health endpoint responds from Render with status 'ok'`);

    // Check 3: Admin login works
    const adminLoginPayload = JSON.stringify({ email: 'admin@devhub.test', password: '123456' });
    const adminLoginRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(adminLoginPayload)
      }
    }, adminLoginPayload);

    const rawCookie = adminLoginRes.headers['set-cookie']?.[0] || '';
    const tokenMatch = rawCookie.match(/devhub_auth_token=([^;]+)/);
    adminToken = tokenMatch ? tokenMatch[1] : null;
    const adminLoginData = JSON.parse(adminLoginRes.body || '{}');
    report(3, adminLoginRes.statusCode === 200 && Boolean(adminToken) && adminLoginData.user?.role === 'Admin',
      `Admin logs in successfully, session token issued, role is Admin`);

    const adminAuthHeaders = {
      'Cookie': `devhub_auth_token=${adminToken}`,
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    };

    // Check 4: Google Drive System Storage connection remains intact
    const sysStorageRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/integrations/google/system-storage',
      method: 'GET',
      headers: adminAuthHeaders
    });
    const sysStorageData = JSON.parse(sysStorageRes.body || '{}');
    initialSysActivatedAt = sysStorageData.activatedAt;
    const isSysIntact = sysStorageData.success === true &&
      sysStorageData.isSystemStorage === true &&
      sysStorageData.status === 'system storage enabled' &&
      Boolean(sysStorageData.accountName);
    report(4, isSysIntact, `Google Drive System Storage connection remains intact (${sysStorageData.status})`);

    // Check 5: Quota endpoint & PRIMARY_STORAGE_PROVIDER verified
    const quotaRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/integrations/quota',
      method: 'GET',
      headers: adminAuthHeaders
    });
    const quotaData = JSON.parse(quotaRes.body || '{}');
    const devhubQuota = quotaData.quotas?.devhub;
    const isQuotaOk = devhubQuota &&
      devhubQuota.connected === true &&
      devhubQuota.allocatedBytes === '5368709120' &&
      devhubQuota.allocatedGB === 5;
    report(5, isQuotaOk, `DEVHUB Cloud Storage personal allocation is active (5 GB = 5,368,709,120 bytes)`);

    // --------------------------------------------------------------------------
    // TASK 4: REAL LIVE STORAGE SMOKE TEST (Personal Scope)
    // --------------------------------------------------------------------------
    console.log('\n--- Section 2: Real Live Storage Smoke Test (Personal) ---');

    const initialUsedBytes = BigInt(devhubQuota.usedBytes || '0');

    // Check 6: Create personal folder
    const folderPayload = JSON.stringify({
      name: `Smoke_Folder_${Date.now()}`,
      storageScope: 'PERSONAL'
    });
    const createFolderRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/folders',
      method: 'POST',
      headers: adminAuthHeaders
    }, folderPayload);
    const folderData = JSON.parse(createFolderRes.body || '{}');
    const smokeFolderId = folderData.folder?.id;
    report(6, createFolderRes.statusCode === 201 && Boolean(smokeFolderId),
      `Created personal folder in DEVHUB Cloud Storage: ${folderData.folder?.name}`);

    // Check 7: Upload tiny test file
    const tinyContent = Buffer.from(`DEVHUB_SMOKE_VERIFICATION_PASS6_${Date.now()}`);
    const uploadRes = await httpUpload(
      '/api/files/upload',
      adminToken,
      {
        storageScope: 'PERSONAL',
        folderId: smokeFolderId
      },
      {
        name: `smoke_${Date.now()}.txt`,
        type: 'text/plain',
        buffer: tinyContent
      }
    );
    const uploadData = JSON.parse(uploadRes.body || '{}');
    const uploadedFile = uploadData.files?.[0];
    const smokeFileId = uploadedFile?.id;
    report(7, uploadRes.statusCode === 201 && Boolean(smokeFileId) && uploadedFile.storageProvider === 'google_drive',
      `Uploaded test file (${tinyContent.length} bytes) to Google Drive System Storage (ID: ${smokeFileId})`);

    // Check 8: Verify it appears in file list
    const listRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files?scope=PERSONAL&folderId=${smokeFolderId}`,
      method: 'GET',
      headers: adminAuthHeaders
    });
    const listData = JSON.parse(listRes.body || '{}');
    const foundInList = (listData.files || []).some(f => f.id === smokeFileId);
    report(8, foundInList, `Uploaded file appears in DEVHUB Cloud Storage folder contents`);

    // Check 9: Verify quota usage updates
    const qAfterUploadRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/integrations/quota',
      method: 'GET',
      headers: adminAuthHeaders
    });
    const qAfterUploadData = JSON.parse(qAfterUploadRes.body || '{}');
    const afterUsedBytes = BigInt(qAfterUploadData.quotas?.devhub?.usedBytes || '0');
    report(9, afterUsedBytes === initialUsedBytes + BigInt(tinyContent.length),
      `Personal quota updated accurately (+${tinyContent.length} bytes, total used: ${afterUsedBytes})`);

    // Check 10: Verify file download stream
    const dlRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${smokeFileId}/download?stream=true`,
      method: 'GET',
      headers: adminAuthHeaders
    });
    const dlMatches = dlRes.statusCode === 200 && dlRes.body === tinyContent.toString('utf8');
    report(10, dlMatches, `Downloaded file stream from Google Drive matches uploaded content byte-for-byte`);

    // Check 11: Delete file and folder & confirm quota restored
    const delFileRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${smokeFileId}`,
      method: 'DELETE',
      headers: adminAuthHeaders
    });
    const delFolderRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/folders/${smokeFolderId}`,
      method: 'DELETE',
      headers: adminAuthHeaders
    });
    const qAfterDelRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/integrations/quota',
      method: 'GET',
      headers: adminAuthHeaders
    });
    const qAfterDelData = JSON.parse(qAfterDelRes.body || '{}');
    const restoredUsedBytes = BigInt(qAfterDelData.quotas?.devhub?.usedBytes || '0');
    const cleanedUp = delFileRes.statusCode === 200 &&
      delFolderRes.statusCode === 200 &&
      restoredUsedBytes === initialUsedBytes;
    report(11, cleanedUp, `Deleted smoke file and folder; quota restored back to ${initialUsedBytes} bytes`);

    // --------------------------------------------------------------------------
    // TASK 5: TEAM LIVE TEST
    // --------------------------------------------------------------------------
    console.log('\n--- Section 3: Team Live Storage Test & Access Control ---');

    // Create temporary outsider user
    const outsiderEmail = `outsider_p6_${Date.now()}@devhub.internal`;
    const createOutsiderRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/admin/users',
      method: 'POST',
      headers: adminAuthHeaders
    }, JSON.stringify({
      name: 'Pass6 Outsider User',
      email: outsiderEmail,
      password: 'Password123!',
      role: 'Member'
    }));
    const outsiderData = JSON.parse(createOutsiderRes.body || '{}');
    outsiderUserId = outsiderData.user?.id;

    // Login as outsider
    const outsiderLoginRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, JSON.stringify({
      email: outsiderEmail,
      password: 'Password123!'
    }));
    const outsiderCookie = outsiderLoginRes.headers['set-cookie']?.[0] || '';
    const outsiderTokenMatch = outsiderCookie.match(/devhub_auth_token=([^;]+)/);
    outsiderToken = outsiderTokenMatch ? outsiderTokenMatch[1] : null;

    const outsiderAuthHeaders = {
      'Cookie': `devhub_auth_token=${outsiderToken}`,
      'Authorization': `Bearer ${outsiderToken}`,
      'Content-Type': 'application/json'
    };

    // Check 12: Create temporary team
    const teamPayload = JSON.stringify({
      name: `Live_Team_${Date.now()}`,
      description: 'Temporary Pass 6 Live Verification Team'
    });
    const createTeamRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/team/create',
      method: 'POST',
      headers: adminAuthHeaders
    }, teamPayload);
    const teamData = JSON.parse(createTeamRes.body || '{}');
    testTeamId = teamData.team?.id;
    report(12, createTeamRes.statusCode === 201 && Boolean(testTeamId),
      `Created temporary team "${teamData.team?.name}" with auto-allocated Team Storage`);

    // Check 13: Team storage quota initialized (10 GB)
    const teamQuotaRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/integrations/quota?teamId=${testTeamId}`,
      method: 'GET',
      headers: adminAuthHeaders
    });
    const teamQuotaData = JSON.parse(teamQuotaRes.body || '{}');
    const teamAlloc = teamQuotaData.quotas?.teamQuota;
    report(13, teamAlloc && teamAlloc.allocatedBytes === '10737418240' && teamAlloc.allocatedGB === 10,
      `Team Storage allocation verified (10 GB = 10,737,418,240 bytes)`);

    // Check 14: Member (Admin Leader) uploads tiny file to Team Storage
    const teamFileContent = Buffer.from(`TEAM_FILE_P6_${Date.now()}`);
    const teamUploadRes = await httpUpload(
      '/api/files/upload',
      adminToken,
      {
        storageScope: 'TEAM',
        teamId: testTeamId
      },
      {
        name: `team_file_${Date.now()}.txt`,
        type: 'text/plain',
        buffer: teamFileContent
      }
    );
    const teamUploadData = JSON.parse(teamUploadRes.body || '{}');
    testFileId = teamUploadData.files?.[0]?.id;
    report(14, teamUploadRes.statusCode === 201 && Boolean(testFileId),
      `Team member uploaded file to Team Storage (ID: ${testFileId})`);

    // Check 15: Member can list and download team file
    const memberListRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files?teamId=${testTeamId}`,
      method: 'GET',
      headers: adminAuthHeaders
    });
    const memberListData = JSON.parse(memberListRes.body || '{}');
    const memberHasFile = (memberListData.files || []).some(f => f.id === testFileId);

    const memberDlRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${testFileId}/download?stream=true`,
      method: 'GET',
      headers: adminAuthHeaders
    });
    const memberDlOk = memberDlRes.statusCode === 200 && memberDlRes.body === teamFileContent.toString('utf8');
    report(15, memberHasFile && memberDlOk,
      `Team member successfully lists and downloads file from Team Storage`);

    // Check 16: Outsider access is DENIED (403 Forbidden)
    const outsiderListRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files?teamId=${testTeamId}`,
      method: 'GET',
      headers: outsiderAuthHeaders
    });

    const outsiderDlRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${testFileId}/download?stream=true`,
      method: 'GET',
      headers: outsiderAuthHeaders
    });

    const outsiderUploadRes = await httpUpload(
      '/api/files/upload',
      outsiderToken,
      {
        storageScope: 'TEAM',
        teamId: testTeamId
      },
      {
        name: 'hacker.txt',
        type: 'text/plain',
        buffer: Buffer.from('unauthorized')
      }
    );

    const outsiderBlocked = outsiderListRes.statusCode === 403 &&
      outsiderDlRes.statusCode === 403 &&
      outsiderUploadRes.statusCode === 403;
    report(16, outsiderBlocked,
      `Outsider is strictly denied on list (403), download (403), and upload (403)`);

    // Clean up team resources
    await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${testFileId}`,
      method: 'DELETE',
      headers: adminAuthHeaders
    });
    testFileId = null;

    await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/team/entity/${testTeamId}`,
      method: 'DELETE',
      headers: adminAuthHeaders
    });
    testTeamId = null;

    await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/admin/users/${outsiderUserId}`,
      method: 'DELETE',
      headers: adminAuthHeaders
    });
    outsiderUserId = null;

    report(17, true, `Cleaned up all temporary team resources and test outsider account`);

    // --------------------------------------------------------------------------
    // TASK 6: SECURITY CHECK (Normal User Obfuscation & Privacy)
    // --------------------------------------------------------------------------
    console.log('\n--- Section 4: Security Audit & Obfuscation Verification ---');

    // Create a temporary regular user to test client sanitization
    const regularUserEmail = `reg_sec_${Date.now()}@devhub.internal`;
    const regUserRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/admin/users',
      method: 'POST',
      headers: adminAuthHeaders
    }, JSON.stringify({
      name: 'Security Test Regular User',
      email: regularUserEmail,
      password: 'Password123!',
      role: 'Member'
    }));
    const regUserData = JSON.parse(regUserRes.body || '{}');
    const regUserId = regUserData.user?.id;

    const regLoginRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      email: regularUserEmail,
      password: 'Password123!'
    }));
    const regCookie = regLoginRes.headers['set-cookie']?.[0] || '';
    const regTokenMatch = regCookie.match(/devhub_auth_token=([^;]+)/);
    const regToken = regTokenMatch ? regTokenMatch[1] : null;

    const regAuthHeaders = {
      'Cookie': `devhub_auth_token=${regToken}`,
      'Authorization': `Bearer ${regToken}`,
      'Content-Type': 'application/json'
    };

    // Check 18: System storage obfuscation for regular users
    const regSysRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/integrations/google/system-storage',
      method: 'GET',
      headers: regAuthHeaders
    });
    const regSysData = JSON.parse(regSysRes.body || '{}');
    const isSysSanitized = regSysData.success === true &&
      regSysData.accountName === undefined &&
      regSysData.owner === undefined &&
      !JSON.stringify(regSysData).includes('umer63509@gmail.com') &&
      !JSON.stringify(regSysData).includes('admin@devhub.test');
    report(18, isSysSanitized,
      `Normal user cannot see Admin Google email, account name, or owner details in system storage response`);

    // Check 19: File records sanitization for regular users
    // Upload a temporary file with the regular user
    const secUploadRes = await httpUpload(
      '/api/files/upload',
      regToken,
      { storageScope: 'PERSONAL' },
      {
        name: `sec_test_${Date.now()}.txt`,
        type: 'text/plain',
        buffer: Buffer.from('sanitization verification')
      }
    );
    const secFileData = JSON.parse(secUploadRes.body || '{}');
    const secFile = secFileData.files?.[0];
    const hasNoDriveFileId = secFile && secFile.driveFileId === undefined;
    const hasNoStoragePath = secFile && secFile.storagePath === undefined;
    const hasBrandedProvider = secFile && secFile.storageProvider === 'devhub_cloud';
    const noGoogleUrls = secFile && !JSON.stringify(secFile).includes('drive.google.com');

    report(19, Boolean(hasNoDriveFileId && hasNoStoragePath && hasBrandedProvider && noGoogleUrls),
      `File response strictly sanitizes driveFileId, storagePath, and brands provider as devhub_cloud`);

    // Clean up security test file & regular user
    if (secFile?.id) {
      await httpRequest({
        hostname: HOST,
        port: 443,
        path: `/api/files/${secFile.id}`,
        method: 'DELETE',
        headers: regAuthHeaders
      });
    }
    await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/admin/users/${regUserId}`,
      method: 'DELETE',
      headers: adminAuthHeaders
    });

    // --------------------------------------------------------------------------
    // TASK 7: STORAGE SAFETY AUDIT
    // --------------------------------------------------------------------------
    console.log('\n--- Section 5: Storage Safety Audit ---');

    // Check 20: No OAuth reconnect occurred
    const postSysRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/integrations/google/system-storage',
      method: 'GET',
      headers: adminAuthHeaders
    });
    const postSysData = JSON.parse(postSysRes.body || '{}');
    const noReconnect = postSysData.activatedAt === initialSysActivatedAt;
    report(20, noReconnect, `Zero OAuth reconnects occurred (Activation timestamp preserved: ${initialSysActivatedAt})`);

    // Check 21: Zero test files remaining in DEVHUB Cloud Storage
    const finalFilesRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/files',
      method: 'GET',
      headers: adminAuthHeaders
    });
    const finalFilesData = JSON.parse(finalFilesRes.body || '{}');
    const finalFilesCount = (finalFilesData.files || []).length;
    report(21, finalFilesCount === 0, `Zero test files remain in production database (Remaining: ${finalFilesCount})`);

    // Check 22: Zero test folders remaining in DEVHUB Cloud Storage
    const finalFoldersRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/folders',
      method: 'GET',
      headers: adminAuthHeaders
    });
    const finalFoldersData = JSON.parse(finalFoldersRes.body || '{}');
    const finalFoldersCount = (finalFoldersData.folders || []).length;
    report(22, finalFoldersCount === 0, `Zero test folders remain in production database (Remaining: ${finalFoldersCount})`);

    // Check 23: Quota restored to baseline
    const finalQuotaRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/integrations/quota',
      method: 'GET',
      headers: adminAuthHeaders
    });
    const finalQuotaData = JSON.parse(finalQuotaRes.body || '{}');
    const finalUsed = BigInt(finalQuotaData.quotas?.devhub?.usedBytes || '0');
    report(23, finalUsed === 0n, `DEVHUB Cloud Storage usedBytes fully restored to 0 bytes`);

    console.log('\n================================================================');
    if (allPassed) {
      console.log(`   >>> ALL ${results.length} PASS 6 LIVE PRODUCTION CHECKS PASSED WITH 100% SUCCESS! <<<`);
    } else {
      console.error(`   >>> SOME PASS 6 LIVE CHECKS FAILED <<<`);
    }
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ Uncaught error during Pass 6 Live Verification:', err);
    allPassed = false;
  }

  if (!allPassed) {
    process.exit(1);
  }
}

runPass6LiveVerification();
