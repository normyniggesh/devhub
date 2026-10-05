require('dotenv').config();
const { prisma, ensureSchema } = require('./src/db');
const app = require('./src/app');

async function runPass1Verification() {
  console.log('================================================================');
  console.log('   DEVHUB PASS 1 SAFETY & CORRUPTION PREVENTION VERIFICATION   ');
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

  try {
    server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/api`;

    // -----------------------------------------------------------------
    // 1. VERIFY /api/health/clean-reset IS 404
    // -----------------------------------------------------------------
    const getReset = await fetch(`${baseUrl}/health/clean-reset`, { method: 'GET' });
    const postReset = await fetch(`${baseUrl}/health/clean-reset`, { method: 'POST' });
    report(1, getReset.status === 404 && postReset.status === 404, 
      `Endpoint /api/health/clean-reset returns 404 (GET: ${getReset.status}, POST: ${postReset.status})`);

    // -----------------------------------------------------------------
    // 2. VERIFY NO REASSIGNMENT OF GOOGLE DRIVE INTEGRATIONS ON RESTART
    // -----------------------------------------------------------------
    const testUserEmail = `test_hijack_victim_${Date.now()}@devhub.test`;
    const testUser = await prisma.user.create({
      data: {
        email: testUserEmail,
        name: 'Hijack Test Victim',
        passwordHash: 'dummyhash',
        role: 'Member',
        emailVerified: true
      }
    });

    const testInteg = await prisma.userIntegration.create({
      data: {
        userId: testUser.id,
        provider: 'google_drive',
        status: 'connected',
        accountName: 'victim@gmail.com',
        accessToken: 'dummy_token_123',
        metadata: { isSystemStorage: false }
      }
    });

    // Run ensureSchema (which runs bootstrapAdminAccount on server reboot)
    await ensureSchema();

    // Verify integration STILL belongs to testUser
    const refreshedInteg = await prisma.userIntegration.findUnique({
      where: { id: testInteg.id }
    });

    const notHijacked = refreshedInteg && refreshedInteg.userId === testUser.id;
    report(2, notHijacked, 
      `Server restart/bootstrap does NOT reassign Google Drive integration (Owner remains test user ${testUser.id})`);

    // Cleanup test user and integration
    await prisma.userIntegration.delete({ where: { id: testInteg.id } });
    await prisma.user.delete({ where: { id: testUser.id } });

    // -----------------------------------------------------------------
    // 3. VERIFY ADMIN LOGIN WORKS
    // -----------------------------------------------------------------
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@devhub.test', password: '123456' })
    });
    const loginData = await loginRes.json();
    const loginOk = loginRes.ok && loginData.user && loginData.user.role === 'Admin';
    report(3, loginOk, `Admin login succeeds with credentials (role: ${loginData.user?.role})`);

    // -----------------------------------------------------------------
    // 4. VERIFY ONLY ADMIN REMAINS IN DATABASE
    // -----------------------------------------------------------------
    const allUsers = await prisma.user.findMany({ select: { id: true, email: true, role: true } });
    const onlyAdmin = allUsers.length === 1 && allUsers[0].email === 'admin@devhub.test';
    report(4, onlyAdmin, `Database contains exactly 1 persistent user (${allUsers.map(u => u.email).join(', ')})`);

    // -----------------------------------------------------------------
    // 5. VERIFY DEAD CODE REMOVAL FROM FILES CONTROLLER
    // -----------------------------------------------------------------
    const fs = require('fs');
    const path = require('path');
    const filesContent = fs.readFileSync(path.join(__dirname, 'src/controllers/files.js'), 'utf8');
    const hasDeletedModel = filesContent.includes('prisma.storageAllocation');
    const hasOldReserve = filesContent.includes('storageQuotaService.reserve');
    const hasOldFinalize = filesContent.includes('storageQuotaService.finalize');
    const hasOldRelease = filesContent.includes('storageQuotaService.release');
    const deadCodeClean = !hasDeletedModel && !hasOldReserve && !hasOldFinalize && !hasOldRelease;
    report(5, deadCodeClean, 'src/controllers/files.js contains zero references to deleted StorageAllocation or old quota methods');

    console.log('\n================================================================');
    if (allPassed) {
      console.log('   >>> ALL PASS 1 SAFETY CHECKS PASSED CLEANLY! <<<');
    } else {
      console.error('   >>> SOME PASS 1 SAFETY CHECKS FAILED <<<');
    }
    console.log('================================================================\n');

  } finally {
    if (server) server.close();
    await prisma.$disconnect();
  }

  if (!allPassed) process.exit(1);
}

runPass1Verification().catch(err => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
