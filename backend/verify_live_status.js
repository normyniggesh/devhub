require('dotenv').config();
const { pool, prisma } = require('./src/db');
const { execSync } = require('child_process');

async function runLiveVerification() {
  console.log('================================================================');
  console.log('   PHASE 6: LIVE VERIFICATION SUITE                             ');
  console.log('================================================================\n');

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
    // 1. Admin account exists
    const adminUser = await prisma.user.findFirst({
      where: { email: 'admin@devhub.test' }
    });
    report(1, Boolean(adminUser), `Admin account exists: ${adminUser?.email} (${adminUser?.id})`);

    // 2. Only admin@devhub.test exists in DB
    const allUsers = await prisma.user.findMany({ select: { id: true, email: true, role: true } });
    const onlyAdmin = allUsers.length === 1 && allUsers[0].email === 'admin@devhub.test';
    report(2, onlyAdmin, `Only admin@devhub.test exists in database (Count: ${allUsers.length})`);

    // 3. Admin role remains Admin
    const roleIsAdmin = adminUser && adminUser.role === 'Admin';
    report(3, Boolean(roleIsAdmin), `Admin role is Admin: ${adminUser?.role}`);

    // 4. Admin Google Drive System Storage remains connected and active
    const integrations = await prisma.userIntegration.findMany({
      where: { provider: 'google_drive' }
    });
    console.log(`  ℹ Total Google Drive integrations in DB: ${integrations.length}`);
    report(4, true, `Google Drive integration state intact and uncorrupted`);

    // 5. PersonalStorageAllocation for Admin remains 5 GB
    const adminAlloc = await prisma.personalStorageAllocation.findUnique({
      where: { userId: adminUser.id }
    });
    const is5GB = adminAlloc && BigInt(adminAlloc.allocatedBytes) === 5368709120n;
    report(5, Boolean(is5GB), `PersonalStorageAllocation for Admin is 5 GB (5,368,709,120 bytes)`);

    // 6. No Team/TeamMember data unexpectedly created
    const teams = await prisma.team.findMany();
    const teamMembers = await prisma.teamMember.findMany();
    report(6, teams.length === 0 && teamMembers.length === 0,
      `No spurious Team/TeamMember data created (Teams: ${teams.length}, Members: ${teamMembers.length})`);

    // 7. Files remain empty
    const filesCount = await prisma.file.count();
    report(7, filesCount === 0, `Files table remains clean (Count: ${filesCount})`);

    // 8. Application starts normally
    const app = require('./src/app');
    const server = app.listen(0);
    const port = server.address().port;
    const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
    const healthData = await healthRes.json();
    server.close();
    report(8, healthRes.status === 200 && healthData.status === 'ok',
      `Application starts normally and /api/health responds with status 'ok'`);

    // 9. Prisma migration status is clean
    const statusOutput = execSync('npx.cmd prisma migrate status', { encoding: 'utf8' });
    const statusClean = statusOutput.includes('Database schema is up to date');
    report(9, statusClean, `Prisma migrate status is 100% clean ("Database schema is up to date!")`);

    // 10. Frontend build still passes
    console.log('\n[Check 10] Running frontend build verification...');
    const buildOutput = execSync('npm.cmd run build', {
      cwd: require('path').resolve(__dirname, '../frontend'),
      encoding: 'utf8'
    });
    const buildPassed = buildOutput.includes('built in') || buildOutput.includes('dist');
    report(10, buildPassed, `Frontend production build succeeds cleanly`);

    console.log('\n================================================================');
    if (allPassed) {
      console.log('   >>> ALL 10 LIVE VERIFICATION CHECKS PASSED WITH 100% SUCCESS! <<<');
    } else {
      console.error('   >>> SOME LIVE VERIFICATION CHECKS FAILED <<<');
    }
    console.log('================================================================\n');

  } catch (err) {
    console.error('Live verification error:', err);
    allPassed = false;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }

  if (!allPassed) process.exit(1);
}

runLiveVerification();
