const prisma = require('./src/db');
const { getTeamData, getMemberDetails } = require('./src/controllers/team');
const { getProviderQuota } = require('./src/controllers/integrations');

async function runVerification() {
  console.log('=== STARTING FILES & TEAM SUITE VERIFICATION ===\n');

  // Find Umer user (the one collaborating with Paarth)
  const umer = await prisma.user.findFirst({
    where: { email: 'umer@devhub.test' }
  });

  if (!umer) {
    throw new Error('Umer user not found in database');
  }

  console.log(`[PASS] Found Umer user: ${umer.name} (${umer.email}), ID: ${umer.id}`);

  // Find Paarth user
  const paarth = await prisma.user.findFirst({
    where: { email: 'paarth@devhub.test' }
  });

  if (!paarth) {
    throw new Error('Paarth user not found in database');
  }

  console.log(`[PASS] Found Paarth user: ${paarth.name} (${paarth.email}), ID: ${paarth.id}`);

  // Test 1: Team Data endpoint
  console.log('\n--- 1. Testing GET /api/team ---');
  let teamResult = null;
  const mockResTeam = {
    json: (data) => { teamResult = data; },
    status: (s) => ({ json: (d) => { teamResult = { status: s, ...d }; } })
  };

  await getTeamData({ userId: umer.id }, mockResTeam);

  if (!teamResult || !teamResult.success) {
    throw new Error(`Team data fetch failed: ${JSON.stringify(teamResult)}`);
  }

  console.log('[PASS] Team data fetched successfully:');
  console.log(`  - Total Members: ${teamResult.members.length}`);
  console.log(`  - Shared Projects: ${teamResult.summary.sharedProjects}`);
  console.log(`  - Admins Count: ${teamResult.summary.admins}`);
  console.log(`  - Pending Invites: ${teamResult.summary.pendingInvites}`);

  const umerInTeam = teamResult.members.find(m => m.id === umer.id);
  const paarthInTeam = teamResult.members.find(m => m.id === paarth.id);

  if (!umerInTeam) throw new Error('Umer missing from team members list');
  if (!paarthInTeam) throw new Error('Paarth missing from team members list');

  console.log(`  - Umer role: ${umerInTeam.role}, Projects: ${umerInTeam.projectsCount}`);
  console.log(`  - Paarth role: ${paarthInTeam.role}, Projects: ${paarthInTeam.projectsCount}, Cloud Connected: ${paarthInTeam.cloudConnected} (${paarthInTeam.cloudProviders.join(', ')})`);

  // Test 2: Member Details (No secrets verification)
  console.log('\n--- 2. Testing GET /api/team/:userId & Secrets Scrubbing ---');
  let memberResult = null;
  const mockResMember = {
    json: (data) => { memberResult = data; },
    status: (s) => ({ json: (d) => { memberResult = { status: s, ...d }; } })
  };

  await getMemberDetails({ userId: umer.id, params: { userId: paarth.id } }, mockResMember);

  if (!memberResult || !memberResult.success) {
    throw new Error(`Member details fetch failed: ${JSON.stringify(memberResult)}`);
  }

  const jsonStr = JSON.stringify(memberResult);
  if (jsonStr.includes('passwordHash') || jsonStr.includes('accessToken') || jsonStr.includes('refreshToken')) {
    throw new Error('SECURITY VIOLATION: Secrets or tokens found in member details response!');
  }

  console.log('[PASS] Member details retrieved securely with ZERO secrets or tokens:');
  console.log(`  - Member: ${memberResult.member.name}`);
  console.log(`  - Shared Projects count: ${memberResult.member.sharedProjects.length}`);
  console.log(`  - Integrations count: ${memberResult.member.integrations.length}`);
  console.log(`  - Recent activities count: ${memberResult.recentActivity.length}`);

  // Test 3: Storage Quota Endpoint
  console.log('\n--- 3. Testing GET /api/integrations/quota ---');
  let quotaResult = null;
  const mockResQuota = {
    json: (data) => { quotaResult = data; },
    status: (s) => ({ json: (d) => { quotaResult = { status: s, ...d }; } })
  };

  await getProviderQuota({ userId: umer.id, params: {} }, mockResQuota);

  if (!quotaResult || !quotaResult.success) {
    throw new Error(`Quota fetch failed: ${JSON.stringify(quotaResult)}`);
  }

  console.log('[PASS] Provider quotas retrieved:');
  console.log(`  - DEVHUB Storage: used ${quotaResult.quotas.devhub.used} bytes of ${quotaResult.quotas.devhub.limit} bytes (${quotaResult.quotas.devhub.percentage?.toFixed(2)}%)`);
  console.log(`  - Google Drive: connected=${quotaResult.quotas.google_drive.connected}, available=${quotaResult.quotas.google_drive.available}`);
  console.log(`  - Dropbox: connected=${quotaResult.quotas.dropbox.connected}`);
  console.log(`  - OneDrive: connected=${quotaResult.quotas.onedrive.connected}`);

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
  process.exit(0);
}

runVerification().catch(err => {
  console.error('\n[FAIL] Test Error:', err);
  process.exit(1);
});
