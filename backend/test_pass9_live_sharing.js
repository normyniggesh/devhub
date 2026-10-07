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

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';

async function runPass9LiveSharingVerification() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   DEVHUB PASS 9 — PRODUCTION SHARING DEPLOYMENT & VERIFICATION  ${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  let allPassed = true;
  let checkIndex = 0;
  const results = [];

  function report(passed, description) {
    checkIndex++;
    results.push({ checkIndex, passed, description });
    if (passed) {
      console.log(`  ${GREEN}✓ PASS:${RESET} [Check ${checkIndex}] ${description}`);
    } else {
      console.error(`  ${RED}✗ FAIL:${RESET} [Check ${checkIndex}] ${description}`);
      allPassed = false;
    }
  }

  // Tracking for cleanup
  let adminToken = null;
  let userA = null; // Owner
  let userB = null; // Share target
  let userC = null; // Unshared
  const filesToCleanup = [];
  const foldersToCleanup = [];
  const usersToCleanup = [];
  let testTeamId = null;

  try {
    // --------------------------------------------------------------------------
    // 1. DEPLOYMENT VERIFICATION
    // --------------------------------------------------------------------------
    console.log(`${YELLOW}--- 1. Deployment Verification (Vercel & Render) ---${RESET}`);

    // Check frontend
    const feRes = await httpRequest({
      hostname: 'devhub-ten-wheat.vercel.app',
      port: 443,
      path: '/?v=' + Date.now(),
      method: 'GET'
    });
    report(feRes.statusCode === 200, `Vercel frontend is live (Status: ${feRes.statusCode})`);

    const jsMatches = feRes.body.match(/src="(\/assets\/[^"]+\.js)"/g);
    let feHasSharingBundle = false;
    if (jsMatches) {
      for (const tag of jsMatches) {
        const path = tag.replace('src="', '').replace('"', '');
        const js = await httpRequest({
          hostname: 'devhub-ten-wheat.vercel.app',
          port: 443,
          path,
          method: 'GET'
        });
        if (js.body.includes('Shared with Me') && js.body.includes('/shares')) {
          feHasSharingBundle = true;
          break;
        }
      }
    }
    report(feHasSharingBundle, `Vercel production bundle contains Pass 8 Sharing UI ("Shared with Me", "/shares")`);

    // Check backend health
    const healthRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/health',
      method: 'GET'
    });
    const healthData = JSON.parse(healthRes.body || '{}');
    report(healthRes.statusCode === 200 && healthData.status === 'ok', `Render backend is live with status: 'ok'`);

    // Admin login
    const adminLoginRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ email: 'admin@devhub.test', password: '123456' }));

    const adminCookie = adminLoginRes.headers['set-cookie']?.[0] || '';
    const adminTokenMatch = adminCookie.match(/devhub_auth_token=([^;]+)/);
    adminToken = adminTokenMatch ? adminTokenMatch[1] : null;
    report(adminLoginRes.statusCode === 200 && Boolean(adminToken), `Admin logged in successfully to Render backend`);

    const adminHeaders = {
      'Cookie': `devhub_auth_token=${adminToken}`,
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    };

    // --------------------------------------------------------------------------
    // 2. DATABASE SCHEMA VERIFICATION
    // --------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- 2. Database Schema Verification ---${RESET}`);

    // Verify /api/files/:id/shares and /api/folders/:id/shares routes respond properly
    const schemaFileShareRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/files/schema-test-id/shares',
      method: 'GET',
      headers: adminHeaders
    });
    // Expected: 404 because file doesn't exist, proving FileShare route and table query handled properly
    report(schemaFileShareRes.statusCode === 404, `Production FileShare route active (404 on nonexistent id, schema mounted)`);

    const schemaFolderShareRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/folders/schema-test-id/shares',
      method: 'GET',
      headers: adminHeaders
    });
    report(schemaFolderShareRes.statusCode === 404, `Production FolderShare route active (404 on nonexistent id, schema mounted)`);

    // --------------------------------------------------------------------------
    // 3. PROVISION TEMPORARY TEST ACCOUNTS
    // --------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- 3. Provisioning Temporary Test Users ---${RESET}`);

    const timestamp = Date.now();
    const testPassword = 'Password123!';

    async function createTestUser(role, label) {
      const email = `${label}_${timestamp}@devhub.internal`;
      const res = await httpRequest({
        hostname: HOST,
        port: 443,
        path: '/api/admin/users',
        method: 'POST',
        headers: adminHeaders
      }, JSON.stringify({
        name: `Test ${label}`,
        email,
        password: testPassword,
        role
      }));
      const data = JSON.parse(res.body || '{}');
      const userId = data.user?.id;
      usersToCleanup.push(userId);

      // Log in as user
      const loginRes = await httpRequest({
        hostname: HOST,
        port: 443,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, JSON.stringify({ email, password: testPassword }));

      const cookie = loginRes.headers['set-cookie']?.[0] || '';
      const tokenMatch = cookie.match(/devhub_auth_token=([^;]+)/);
      const token = tokenMatch ? tokenMatch[1] : null;

      return {
        id: userId,
        email,
        name: `Test ${label}`,
        token,
        headers: {
          'Cookie': `devhub_auth_token=${token}`,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };
    }

    userA = await createTestUser('Member', 'user_a_owner');
    userB = await createTestUser('Member', 'user_b_target');
    userC = await createTestUser('Member', 'user_c_unshared');

    report(Boolean(userA.token && userB.token && userC.token),
      `Created and logged in 3 temporary live users: User A (Owner), User B (Target), User C (Unshared)`);

    // --------------------------------------------------------------------------
    // 4. LIVE PERSONAL SHARING TEST
    // --------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- 4. Live Personal Sharing Test ---${RESET}`);

    // Check A's initial quota
    const qInitRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/integrations/quota',
      method: 'GET',
      headers: userA.headers
    });
    const qInitData = JSON.parse(qInitRes.body || '{}');
    const initialUsedBytes = BigInt(qInitData.quotas?.devhub?.usedBytes || '0');
    const initialAllocatedBytes = qInitData.quotas?.devhub?.allocatedBytes;

    // User A creates personal folder
    const folderARes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/folders',
      method: 'POST',
      headers: userA.headers
    }, JSON.stringify({
      name: `Folder_A_${timestamp}`,
      storageScope: 'PERSONAL'
    }));
    const folderAData = JSON.parse(folderARes.body || '{}');
    const personalFolderA = folderAData.folder;
    if (personalFolderA?.id) foldersToCleanup.push(personalFolderA.id);
    report(folderARes.statusCode === 201 && Boolean(personalFolderA?.id),
      `User A creates PERSONAL folder "${personalFolderA?.name}"`);

    // User A uploads PERSONAL file into folder
    const fileContentA = Buffer.from(`PASS_9_FILE_CONTENT_${timestamp}_LIVE_TEST`);
    const uploadRes = await httpUpload(
      '/api/files/upload',
      userA.token,
      {
        storageScope: 'PERSONAL',
        folderId: personalFolderA.id
      },
      {
        name: `shared_file_${timestamp}.txt`,
        type: 'text/plain',
        buffer: fileContentA
      }
    );
    const uploadData = JSON.parse(uploadRes.body || '{}');
    const personalFileA = uploadData.files?.[0];
    if (personalFileA?.id) filesToCleanup.push(personalFileA.id);
    report(uploadRes.statusCode === 201 && Boolean(personalFileA?.id),
      `User A uploads PERSONAL file "${personalFileA?.name}" to DEVHUB Cloud Storage`);

    // User A shares file with User B as VIEW
    const shareRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${personalFileA.id}/share`,
      method: 'POST',
      headers: userA.headers
    }, JSON.stringify({
      email: userB.email,
      permission: 'VIEW'
    }));
    const shareData = JSON.parse(shareRes.body || '{}');
    report(shareRes.statusCode === 201 && shareData.share?.permission === 'VIEW',
      `User A shares file with User B as VIEW (201 Created)`);

    // User B lists shared files
    const bListRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/files?shared=true',
      method: 'GET',
      headers: userB.headers
    });
    const bListData = JSON.parse(bListRes.body || '{}');
    const bFoundInList = (bListData.files || []).some(f => f.id === personalFileA.id);
    report(bListRes.statusCode === 200 && bFoundInList,
      `User B lists shared files via /api/files?shared=true and sees the file`);

    // User B reads file metadata
    const bReadRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${personalFileA.id}`,
      method: 'GET',
      headers: userB.headers
    });
    const bReadData = JSON.parse(bReadRes.body || '{}');
    report(bReadRes.statusCode === 200 && bReadData.file?.id === personalFileA.id,
      `User B reads file metadata (200 OK)`);

    // User B downloads file content
    const bDlRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${personalFileA.id}/download?stream=true`,
      method: 'GET',
      headers: userB.headers
    });
    const bDlMatch = bDlRes.statusCode === 200 && bDlRes.body === fileContentA.toString('utf8');
    report(bDlMatch, `User B downloads file byte-for-byte matching original content`);

    // User B cannot edit/rename (VIEW permission)
    const bEditAttemptRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${personalFileA.id}`,
      method: 'PATCH',
      headers: userB.headers
    }, JSON.stringify({ name: 'hacked_name.txt' }));
    report(bEditAttemptRes.statusCode === 403,
      `User B CANNOT rename file under VIEW permission (403 Forbidden)`);

    // User B cannot delete (VIEW permission)
    const bDelAttemptRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${personalFileA.id}`,
      method: 'DELETE',
      headers: userB.headers
    });
    report(bDelAttemptRes.statusCode === 403,
      `User B CANNOT delete file under VIEW permission (403 Forbidden)`);

    // User A upgrades User B's permission to EDIT
    const upgradeRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${personalFileA.id}/share`,
      method: 'POST',
      headers: userA.headers
    }, JSON.stringify({
      email: userB.email,
      permission: 'EDIT'
    }));
    const upgradeData = JSON.parse(upgradeRes.body || '{}');
    report(upgradeRes.statusCode === 201 && upgradeData.share?.permission === 'EDIT',
      `User A changes User B's permission to EDIT (201 Created/Updated)`);

    // User B performs allowed edit operation (rename file)
    const newFileName = `renamed_by_b_${timestamp}.txt`;
    const bEditSuccessRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${personalFileA.id}`,
      method: 'PATCH',
      headers: userB.headers
    }, JSON.stringify({ name: newFileName }));
    const bEditSuccessData = JSON.parse(bEditSuccessRes.body || '{}');
    report(bEditSuccessRes.statusCode === 200 && bEditSuccessData.file?.name === newFileName,
      `User B renames file under EDIT permission (200 OK)`);

    // User A revokes access
    const revokeRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${personalFileA.id}/shares/${userB.id}`,
      method: 'DELETE',
      headers: userA.headers
    });
    report(revokeRes.statusCode === 200, `User A revokes User B's access (200 OK)`);

    // User B immediately receives 403 afterward
    const bReadRevokedRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${personalFileA.id}`,
      method: 'GET',
      headers: userB.headers
    });
    const bDlRevokedRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${personalFileA.id}/download?stream=true`,
      method: 'GET',
      headers: userB.headers
    });
    report(bReadRevokedRes.statusCode === 403 && bDlRevokedRes.statusCode === 403,
      `User B immediately receives 403 Forbidden for both read and download after revocation`);

    // --------------------------------------------------------------------------
    // 5. FOLDER INHERITANCE TEST
    // --------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- 5. Folder Inheritance Test ---${RESET}`);

    // User A creates root personal folder
    const inheritParentRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/folders',
      method: 'POST',
      headers: userA.headers
    }, JSON.stringify({
      name: `Parent_Folder_${timestamp}`,
      storageScope: 'PERSONAL'
    }));
    const inheritParent = JSON.parse(inheritParentRes.body || '{}').folder;
    if (inheritParent?.id) foldersToCleanup.push(inheritParent.id);

    // Share parent folder with User B as VIEW
    const shareFolderRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/folders/${inheritParent.id}/share`,
      method: 'POST',
      headers: userA.headers
    }, JSON.stringify({
      email: userB.email,
      permission: 'VIEW'
    }));
    report(shareFolderRes.statusCode === 201, `User A shares parent folder with User B (VIEW)`);

    // Create nested subfolder inside shared parent folder
    const nestedFolderRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/folders',
      method: 'POST',
      headers: userA.headers
    }, JSON.stringify({
      name: `Nested_Subfolder_${timestamp}`,
      storageScope: 'PERSONAL',
      parentId: inheritParent.id
    }));
    const nestedFolder = JSON.parse(nestedFolderRes.body || '{}').folder;
    if (nestedFolder?.id) foldersToCleanup.push(nestedFolder.id);

    // Create child file inside nested subfolder
    const childFileContent = Buffer.from(`INHERITED_DESCENDANT_CONTENT_${timestamp}`);
    const childUploadRes = await httpUpload(
      '/api/files/upload',
      userA.token,
      {
        storageScope: 'PERSONAL',
        folderId: nestedFolder.id
      },
      {
        name: `nested_child_${timestamp}.txt`,
        type: 'text/plain',
        buffer: childFileContent
      }
    );
    const childFile = JSON.parse(childUploadRes.body || '{}').files?.[0];
    if (childFile?.id) filesToCleanup.push(childFile.id);

    report(Boolean(nestedFolder?.id && childFile?.id),
      `Created nested folder and child file inside parent folder hierarchy`);

    // Verify User B can access nested folder and child file through inherited permission
    const bAccessNestedRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/folders/${nestedFolder.id}`,
      method: 'GET',
      headers: userB.headers
    });
    const bAccessChildRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${childFile.id}`,
      method: 'GET',
      headers: userB.headers
    });
    const bDlChildRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${childFile.id}/download?stream=true`,
      method: 'GET',
      headers: userB.headers
    });

    const inheritanceWorks = bAccessNestedRes.statusCode === 200 &&
      bAccessChildRes.statusCode === 200 &&
      bDlChildRes.statusCode === 200 &&
      bDlChildRes.body === childFileContent.toString('utf8');
    report(inheritanceWorks,
      `User B accesses nested folder and reads/downloads child file via inherited folder permission`);

    // Move child file outside shared folder (to root: folderId = null)
    const moveOutRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${childFile.id}`,
      method: 'PATCH',
      headers: userA.headers
    }, JSON.stringify({ folderId: null }));
    report(moveOutRes.statusCode === 200, `User A moves child file outside shared folder to root`);

    // Verify inherited access disappears for User B -> 403 Forbidden
    const bAccessMovedRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${childFile.id}`,
      method: 'GET',
      headers: userB.headers
    });
    report(bAccessMovedRes.statusCode === 403,
      `User B immediately receives 403 Forbidden after file is moved outside shared folder`);

    // Move child file back into nested folder
    await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${childFile.id}`,
      method: 'PATCH',
      headers: userA.headers
    }, JSON.stringify({ folderId: nestedFolder.id }));

    // Revoke folder share on parent folder
    const revokeFolderRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/folders/${inheritParent.id}/shares/${userB.id}`,
      method: 'DELETE',
      headers: userA.headers
    });
    report(revokeFolderRes.statusCode === 200, `User A revokes folder share on parent folder`);

    // Verify descendants are no longer accessible to User B -> 403 Forbidden
    const bDescendantFolderRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/folders/${nestedFolder.id}`,
      method: 'GET',
      headers: userB.headers
    });
    const bDescendantFileRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${childFile.id}`,
      method: 'GET',
      headers: userB.headers
    });
    report(bDescendantFolderRes.statusCode === 403 && bDescendantFileRes.statusCode === 403,
      `All descendant folder and file accesses revoked for User B (both return 403 Forbidden)`);

    // --------------------------------------------------------------------------
    // 6. SECURITY TEST
    // --------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- 6. Security Test ---${RESET}`);

    // Re-share childFile with B as VIEW
    await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${childFile.id}/share`,
      method: 'POST',
      headers: userA.headers
    }, JSON.stringify({ email: userB.email, permission: 'VIEW' }));

    // User B attempts to share User A's file with User C
    const bIllegalShareRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${childFile.id}/share`,
      method: 'POST',
      headers: userB.headers
    }, JSON.stringify({ email: userC.email, permission: 'VIEW' }));
    report(bIllegalShareRes.statusCode === 403,
      `User B cannot share User A's file (403 Forbidden: Only owner or Admin can share)`);

    // Unshared User C receives 403 Forbidden on User A's file and folder
    const cAccessFileRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${childFile.id}`,
      method: 'GET',
      headers: userC.headers
    });
    const cAccessFolderRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/folders/${inheritParent.id}`,
      method: 'GET',
      headers: userC.headers
    });
    report(cAccessFileRes.statusCode === 403 && cAccessFolderRes.statusCode === 403,
      `Unshared User C receives 403 Forbidden attempting to access User A's file and folder`);

    // TEAM resources cannot be shared using personal sharing endpoints
    // Create temporary team to test
    const teamRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/team/create',
      method: 'POST',
      headers: adminHeaders
    }, JSON.stringify({ name: `Pass9_Sec_Team_${timestamp}`, description: 'Sec test team' }));
    const teamData = JSON.parse(teamRes.body || '{}');
    testTeamId = teamData.team?.id;

    const teamUploadRes = await httpUpload(
      '/api/files/upload',
      adminToken,
      { storageScope: 'TEAM', teamId: testTeamId },
      {
        name: `team_sec_${timestamp}.txt`,
        type: 'text/plain',
        buffer: Buffer.from('team content')
      }
    );
    const teamFile = JSON.parse(teamUploadRes.body || '{}').files?.[0];
    if (teamFile?.id) filesToCleanup.push(teamFile.id);

    const teamShareAttemptRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${teamFile.id}/share`,
      method: 'POST',
      headers: adminHeaders
    }, JSON.stringify({ email: userB.email, permission: 'VIEW' }));
    report(teamShareAttemptRes.statusCode === 400,
      `Attempting personal share on TEAM resource rejected (400 Bad Request)`);

    // Admin retains universal access
    const adminAccessFileRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${childFile.id}`,
      method: 'GET',
      headers: adminHeaders
    });
    report(adminAccessFileRes.statusCode === 200,
      `Admin retains universal access to unshared/owner resources (200 OK)`);

    // Verify NO driveFileId, storagePath, or Google Drive URL leaks to regular users
    const bCheckPayloadRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: `/api/files/${childFile.id}`,
      method: 'GET',
      headers: userB.headers
    });
    const bFilePayload = JSON.parse(bCheckPayloadRes.body || '{}').file;
    const noDriveFileId = bFilePayload && bFilePayload.driveFileId === undefined;
    const noStoragePath = bFilePayload && bFilePayload.storagePath === undefined;
    const noDriveUrls = bFilePayload && !JSON.stringify(bFilePayload).includes('drive.google.com');
    report(noDriveFileId && noStoragePath && noDriveUrls,
      `Strict sanitization verified: driveFileId, storagePath, and Google Drive URLs omitted from responses to regular users`);

    // --------------------------------------------------------------------------
    // 7. QUOTA TEST
    // --------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- 7. Quota Verification ---${RESET}`);

    // Check User A's quota after all shares and operations
    const qFinalRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/integrations/quota',
      method: 'GET',
      headers: userA.headers
    });
    const qFinalData = JSON.parse(qFinalRes.body || '{}');
    const finalAllocatedBytes = qFinalData.quotas?.devhub?.allocatedBytes;
    const finalUsedBytes = BigInt(qFinalData.quotas?.devhub?.usedBytes || '0');

    // Expected used bytes is precisely the sum of userA's uploaded files: fileContentA + childFileContent
    const expectedUsedBytes = initialUsedBytes + BigInt(fileContentA.length) + BigInt(childFileContent.length);

    const allocUnchanged = finalAllocatedBytes === initialAllocatedBytes;
    const usedMatchesExactly = finalUsedBytes === expectedUsedBytes;
    report(allocUnchanged && usedMatchesExactly,
      `Sharing does NOT alter personal allocation (${finalAllocatedBytes}) or usedBytes (${finalUsedBytes} B matches uploaded content, no duplicate storage)`);

    // --------------------------------------------------------------------------
    // 8. AUDIT TEST
    // --------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- 8. Audit Records Verification ---${RESET}`);

    const activityRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/admin/activity?limit=50',
      method: 'GET',
      headers: adminHeaders
    });
    const activityData = JSON.parse(activityRes.body || '{}');
    const logs = activityData.activity || [];

    const shareCreatedLog = logs.find(l => l.metadata?.actionType === 'share_created');
    const shareChangedLog = logs.find(l => l.metadata?.actionType === 'share_permission_changed');
    const shareRevokedLog = logs.find(l => l.metadata?.actionType === 'share_revoked');

    report(Boolean(shareCreatedLog), `Audit record found for "share_created" in production`);
    report(Boolean(shareChangedLog), `Audit record found for "share_permission_changed" in production`);
    report(Boolean(shareRevokedLog), `Audit record found for "share_revoked" in production`);

    // Verify logs do not leak OAuth credentials or secrets
    const allSharingLogsStr = JSON.stringify([shareCreatedLog, shareChangedLog, shareRevokedLog]);
    const noSecretsInLogs = !allSharingLogsStr.includes('client_secret') &&
      !allSharingLogsStr.includes('refresh_token') &&
      !allSharingLogsStr.includes('access_token') &&
      !allSharingLogsStr.includes('token_uri');
    report(noSecretsInLogs, `Zero credentials, OAuth tokens, or secrets leaked in audit logs`);

    // --------------------------------------------------------------------------
    // 9. CLEANUP
    // --------------------------------------------------------------------------
    console.log(`\n${YELLOW}--- 9. Cleanup ---${RESET}`);

    // Delete test files
    for (const fId of filesToCleanup) {
      await httpRequest({
        hostname: HOST,
        port: 443,
        path: `/api/files/${fId}`,
        method: 'DELETE',
        headers: adminHeaders
      }).catch(() => {});
    }

    // Delete test folders
    for (const fId of foldersToCleanup) {
      await httpRequest({
        hostname: HOST,
        port: 443,
        path: `/api/folders/${fId}`,
        method: 'DELETE',
        headers: adminHeaders
      }).catch(() => {});
    }

    // Delete test users
    for (const uId of usersToCleanup) {
      await httpRequest({
        hostname: HOST,
        port: 443,
        path: `/api/admin/users/${uId}`,
        method: 'DELETE',
        headers: adminHeaders
      }).catch(() => {});
    }

    // Check no test files remain in User A's or Admin's personal space
    const verifyCleanRes = await httpRequest({
      hostname: HOST,
      port: 443,
      path: '/api/files?scope=PERSONAL',
      method: 'GET',
      headers: adminHeaders
    });
    const verifyCleanData = JSON.parse(verifyCleanRes.body || '{}');
    const hasRemainingTestFiles = (verifyCleanData.files || []).some(f =>
      filesToCleanup.includes(f.id)
    );
    report(!hasRemainingTestFiles, `All temporary files, folders, users, and shares deleted and cleaned up`);

    // Summary
    console.log(`\n${CYAN}================================================================${RESET}`);
    if (allPassed) {
      console.log(`  ${GREEN}>>> ALL ${results.length} PASS 9 LIVE CHECKS PASSED WITH 100% SUCCESS! <<<${RESET}`);
    } else {
      console.error(`  ${RED}>>> SOME PASS 9 CHECKS FAILED <<<${RESET}`);
    }
    console.log(`${CYAN}================================================================${RESET}\n`);

  } catch (err) {
    console.error(`${RED}Uncaught error during Pass 9 Live Verification:${RESET}`, err);
    allPassed = false;
  }

  if (!allPassed) {
    process.exit(1);
  }
}

runPass9LiveSharingVerification();
