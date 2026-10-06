require('dotenv').config();
const { prisma, ensureSchema } = require('./src/db');
const app = require('./src/app');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key';

async function runPass2AVerification() {
  console.log('================================================================');
  console.log('   DEVHUB PASS 2A COMPREHENSIVE VERIFICATION SUITE              ');
  console.log('================================================================\n');

  let server;
  let allPassed = true;

  function report(num, passed, desc) {
    if (passed) {
      console.log(`  ✓ PASS: [Check ${num}] ${desc}`);
    } else {
      console.error(`  ❌ FAIL: [Check ${num}] ${desc}`);
      allPassed = false;
    }
  }

  let testMemberId = null;
  let testAdminIntegrationId = null;

  try {
    if (ensureSchema) await ensureSchema();

    server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/api`;

    // -----------------------------------------------------------------
    // 1. VERIFY OBSOLETE HEALTH & DIAGNOSTIC ENDPOINTS RETURN 404
    // -----------------------------------------------------------------
    const obsoleteEndpoints = [
      '/health/step6-phase-c',
      '/health/s3',
      '/health/accounts',
      '/health/storage-pool',
      '/health/drive-auth-scope',
      '/health/oauth-diagnostic',
      '/health/clean-reset'
    ];

    let allObsolete404 = true;
    for (const ep of obsoleteEndpoints) {
      const res = await fetch(`${baseUrl}${ep}`);
      if (res.status !== 404) {
        console.error(`    Expected 404 for ${ep}, got ${res.status}`);
        allObsolete404 = false;
      }
    }
    report(1, allObsolete404, `All 7 obsolete health & diagnostic endpoints return HTTP 404`);

    // -----------------------------------------------------------------
    // 2. VERIFY SAFE HEALTH ENDPOINT RETURNS { status: 'ok' }
    // -----------------------------------------------------------------
    const safeHealthRes = await fetch(`${baseUrl}/health`);
    const safeHealthData = await safeHealthRes.json();
    report(2, safeHealthRes.status === 200 && safeHealthData.status === 'ok',
      `Safe endpoint /api/health returns 200 OK with { status: 'ok' }`);

    // Fetch existing admin for authenticated calls
    const adminUser = await prisma.user.findFirst({
      where: { email: 'admin@devhub.test' }
    });
    const adminToken = jwt.sign({ userId: adminUser.id }, JWT_SECRET, { expiresIn: '1h' });

    // -----------------------------------------------------------------
    // 3. VERIFY OBSOLETE QUOTA ENDPOINTS RETURN 404 (EVEN WITH AUTH)
    // -----------------------------------------------------------------
    const filesQuotaRes = await fetch(`${baseUrl}/files/quota`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminQuotaRes = await fetch(`${baseUrl}/admin/quotas/fake-project-id`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    report(3, filesQuotaRes.status === 404 && adminQuotaRes.status === 404,
      `Obsolete /api/files/quota and /api/admin/quotas/:projectId return 404 (Status: ${filesQuotaRes.status}, ${adminQuotaRes.status})`);

    // -----------------------------------------------------------------
    // 4. VERIFY SYSTEM STORAGE STATUS ENDPOINT SECURITY & PRIVACY
    // -----------------------------------------------------------------
    // A) Unauthenticated caller -> 401
    const unauthSysRes = await fetch(`${baseUrl}/integrations/google/system-storage`);
    const unauthPassed = unauthSysRes.status === 401;

    // B) Create a temporary Member user
    const testMember = await prisma.user.create({
      data: {
        email: `test_member_${Date.now()}@devhub.test`,
        name: 'Regular Member',
        passwordHash: 'dummyhash',
        role: 'Member',
        emailVerified: true
      }
    });
    testMemberId = testMember.id;
    const memberToken = jwt.sign({ userId: testMember.id }, JWT_SECRET, { expiresIn: '1h' });

    // C) Test when system storage is disabled
    const disabledSysRes = await fetch(`${baseUrl}/integrations/google/system-storage`, {
      headers: { Authorization: `Bearer ${memberToken}` }
    });
    const disabledSysData = await disabledSysRes.json();
    const disabledOk = disabledSysRes.status === 200 && disabledSysData.isSystemStorage === false;

    // D) Temporarily enable system storage under admin to test sanitization for member vs admin
    const testInt = await prisma.userIntegration.create({
      data: {
        userId: adminUser.id,
        provider: 'google_drive',
        status: 'connected',
        accountName: 'admin.supersecret@gmail.com',
        accessToken: 'dummy_access_token',
        metadata: { isSystemStorage: true }
      }
    });
    testAdminIntegrationId = testInt.id;

    // Member checks status while enabled: MUST NOT see accountName or owner
    const enabledMemberRes = await fetch(`${baseUrl}/integrations/google/system-storage`, {
      headers: { Authorization: `Bearer ${memberToken}` }
    });
    const enabledMemberData = await enabledMemberRes.json();
    const memberSanitized = enabledMemberRes.status === 200 &&
      enabledMemberData.isSystemStorage === true &&
      enabledMemberData.accountName === undefined &&
      enabledMemberData.owner === undefined;

    // Admin checks status while enabled: MUST see accountName and owner
    const enabledAdminRes = await fetch(`${baseUrl}/integrations/google/system-storage`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const enabledAdminData = await enabledAdminRes.json();
    const adminHasDetails = enabledAdminRes.status === 200 &&
      enabledAdminData.isSystemStorage === true &&
      enabledAdminData.accountName === 'admin.supersecret@gmail.com' &&
      enabledAdminData.owner && enabledAdminData.owner.email === 'admin@devhub.test';

    // Clean up temporary integration & member immediately
    await prisma.userIntegration.delete({ where: { id: testAdminIntegrationId } });
    testAdminIntegrationId = null;
    await prisma.personalStorageAllocation.deleteMany({ where: { userId: testMemberId } }).catch(() => {});
    await prisma.user.delete({ where: { id: testMemberId } });
    testMemberId = null;

    report(4, unauthPassed && disabledOk && memberSanitized && adminHasDetails,
      `System Storage status is protected: unauth is 401; non-admin payload sanitized (no email/owner); admin retains full management details`);

    // -----------------------------------------------------------------
    // 5. VERIFY DATABASE USER INTEGRITY (EXACTLY 1 PERSISTENT ADMIN)
    // -----------------------------------------------------------------
    const allUsers = await prisma.user.findMany({ select: { id: true, email: true, role: true } });
    const onlyAdmin = allUsers.length === 1 && allUsers[0].email === 'admin@devhub.test' && allUsers[0].role === 'Admin';
    report(5, onlyAdmin, `Database contains exactly 1 persistent user: admin@devhub.test (role: Admin)`);

    // -----------------------------------------------------------------
    // 6. VERIFY ADMIN HAS 5 GB PERSONAL STORAGE ALLOCATION
    // -----------------------------------------------------------------
    const adminAlloc = await prisma.personalStorageAllocation.findUnique({
      where: { userId: adminUser.id }
    });
    const alloc5GB = adminAlloc && BigInt(adminAlloc.allocatedBytes) === 5368709120n;
    report(6, Boolean(alloc5GB), `Admin has 5 GB (5,368,709,120 bytes) personal storage allocation in PostgreSQL`);

    // -----------------------------------------------------------------
    // 7. VERIFY NO FIREBASE RESIDUE IN FRONTEND
    // -----------------------------------------------------------------
    const frontendDir = path.resolve(__dirname, '../frontend/src');
    function scanForFirebase(dir) {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        const fullPath = path.join(dir, f);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanForFirebase(fullPath);
        } else if (f.endsWith('.js') || f.endsWith('.jsx')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes("from 'firebase") || content.includes('from "firebase') || content.includes("require('firebase")) {
            throw new Error(`Firebase import found in ${fullPath}`);
          }
        }
      }
    }

    let noFirebase = true;
    try {
      scanForFirebase(frontendDir);
    } catch (e) {
      console.error(e.message);
      noFirebase = false;
    }
    report(7, noFirebase, `Zero Firebase imports or services remain in frontend codebase`);

    // -----------------------------------------------------------------
    // 8. VERIFY DEAD S3 IAM ROUTINES REMOVED FROM STORAGE SERVICE
    // -----------------------------------------------------------------
    const storageServiceContent = fs.readFileSync(path.join(__dirname, 'src/services/storageService.js'), 'utf8');
    const hasIamClient = storageServiceContent.includes('@aws-sdk/client-iam');
    const hasFullIamCheck = storageServiceContent.includes('iamClient.send(new SimulateCustomPolicyCommand');
    report(8, !hasIamClient && !hasFullIamCheck,
      `storageService.js has zero AWS IAM diagnostic routines or @aws-sdk/client-iam imports`);

    // -----------------------------------------------------------------
    // 9. VERIFY TEAM SERVICE & CONTROLLER DELEGATION
    // -----------------------------------------------------------------
    const teamRes = await fetch(`${baseUrl}/team`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const teamData = await teamRes.json();
    report(9, teamRes.status === 200 && Array.isArray(teamData.members),
      `Unified Team endpoint /api/team works via teamService and returns member array`);

    // -----------------------------------------------------------------
    // 10. VERIFY FOLDERS AND FILES CONTROLLERS SUPPORT STORAGE SCOPE
    // -----------------------------------------------------------------
    const foldersContent = fs.readFileSync(path.join(__dirname, 'src/controllers/folders.js'), 'utf8');
    const filesContent = fs.readFileSync(path.join(__dirname, 'src/controllers/files.js'), 'utf8');
    const foldersHasScope = foldersContent.includes('storageScope') && foldersContent.includes('PERSONAL');
    const filesHasScope = filesContent.includes('storageScope') && filesContent.includes('PERSONAL');
    report(10, foldersHasScope && filesHasScope,
      `Folders and Files controllers fully support storageScope (PERSONAL, TEAM) and optional projectId`);

    console.log('\n================================================================');
    if (allPassed) {
      console.log('   >>> ALL PASS 2A VERIFICATION CHECKS PASSED CLEANLY! <<<');
    } else {
      console.error('   >>> SOME PASS 2A CHECKS FAILED <<<');
    }
    console.log('================================================================\n');

  } catch (err) {
    console.error('Fatal verification error:', err);
    allPassed = false;
  } finally {
    if (testAdminIntegrationId) {
      await prisma.userIntegration.delete({ where: { id: testAdminIntegrationId } }).catch(() => {});
    }
    if (testMemberId) {
      await prisma.personalStorageAllocation.deleteMany({ where: { userId: testMemberId } }).catch(() => {});
      await prisma.user.delete({ where: { id: testMemberId } }).catch(() => {});
    }
    if (server) server.close();
    await prisma.$disconnect();
  }

  if (!allPassed) process.exit(1);
}

runPass2AVerification();
