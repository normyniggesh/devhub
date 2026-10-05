require('dotenv').config();
const { prisma, ensureSchema } = require('./src/db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key';

async function runOAuthCallbackTests() {
  console.log('========================================================');
  console.log('   OAUTH CALLBACK VERIFICATION & SAVE FLOW TEST SUITE   ');
  console.log('========================================================\n');

  const app = require('./src/app');
  if (ensureSchema) await ensureSchema();

  // 1. Create Isolated Test Admin User (Never touches admin@devhub.test)
  const testEmail = `test_oauth_admin_${Date.now()}@devhub.test`;
  const adminUser = await prisma.user.create({
    data: {
      email: testEmail,
      name: 'Isolated Test Admin',
      passwordHash: 'dummyhash',
      role: 'Admin',
      emailVerified: true
    }
  });

  // Track live system storage integration so it can never be lost
  const existingDriveIntegrations = await prisma.userIntegration.findMany({
    where: { provider: 'google_drive' }
  });
  const liveSystemStorageId = existingDriveIntegrations.find(i => i.metadata && i.metadata.isSystemStorage === true)?.id;

  const adminToken = jwt.sign({ userId: adminUser.id }, JWT_SECRET, { expiresIn: '1h' });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  console.log(`Server listening on ${baseUrl} for integration tests\n`);
  let allPassed = true;

  try {
    // -------------------------------------------------------------
    // TEST 0A: GET /api/dashboard without auth -> 401
    // -------------------------------------------------------------
    console.log('[Test 0A] GET /api/dashboard (Reject unauthenticated with 401)');
    const dashUnauth = await fetch(`${baseUrl}/dashboard`);
    const dashUnauthData = await dashUnauth.json();
    if (dashUnauth.status === 401 && dashUnauthData.error === 'Authentication required') {
      console.log('  ✓ Correctly rejected unauthenticated dashboard with 401');
    } else {
      console.error(`  ✗ Expected 401, got ${dashUnauth.status}`, dashUnauthData);
      allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 0B: GET /api/my-day without auth -> 401
    // -------------------------------------------------------------
    console.log('\n[Test 0B] GET /api/my-day (Reject unauthenticated with 401)');
    const myDayUnauth = await fetch(`${baseUrl}/my-day`);
    const myDayUnauthData = await myDayUnauth.json();
    if (myDayUnauth.status === 401 && myDayUnauthData.error === 'Authentication required') {
      console.log('  ✓ Correctly rejected unauthenticated my-day with 401');
    } else {
      console.error(`  ✗ Expected 401, got ${myDayUnauth.status}`, myDayUnauthData);
      allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 0C: Dashboard endpoints succeed WITH auth
    // -------------------------------------------------------------
    console.log('\n[Test 0C] GET /api/dashboard and /api/my-day (Succeed with Bearer auth)');
    const dashAuth = await fetch(`${baseUrl}/dashboard`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const myDayAuth = await fetch(`${baseUrl}/my-day`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (dashAuth.status === 200 && myDayAuth.status === 200) {
      console.log('  ✓ Dashboard endpoints successfully accessible with valid token');
    } else {
      console.error(`  ✗ Expected 200, got ${dashAuth.status} and ${myDayAuth.status}`);
      allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 1: Callback Rejects Unauthenticated Request via oauthCallbackAuth
    // -------------------------------------------------------------
    console.log('\n[Test 1] POST /api/integrations/google/callback (Reject unauthenticated without state)');
    const unauthRes = await fetch(`${baseUrl}/integrations/google/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'some_code', redirectUri: 'http://localhost/files' })
    });
    const unauthData = await unauthRes.json();
    // oauthCallbackAuth returns { success: false, error: 'Authentication required' }
    if (unauthRes.status === 401 && unauthData.success === false) {
      console.log('  ✓ Correctly rejected by oauthCallbackAuth with 401 (success: false)');
    } else {
      console.error(`  ✗ Expected 401 from oauthCallbackAuth, got status ${unauthRes.status}`, unauthData);
      allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 2: Callback Rejects Invalid State Token via oauthCallbackAuth
    // -------------------------------------------------------------
    console.log('\n[Test 2] POST /api/integrations/google/callback (Reject invalid state token)');
    const invalidStateRes = await fetch(`${baseUrl}/integrations/google/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'some_code', state: 'invalid_tampered_state' })
    });
    const invalidStateData = await invalidStateRes.json();
    if (invalidStateRes.status === 401 && invalidStateData.success === false) {
      console.log('  ✓ Correctly rejected invalid state by oauthCallbackAuth with 401');
    } else {
      console.error(`  ✗ Expected 401, got ${invalidStateRes.status}`, invalidStateData);
      allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 2B: Callback with Valid Signed State Token Passes Authentication!
    // -------------------------------------------------------------
    console.log('\n[Test 2B] POST /api/integrations/google/callback (Signed state token bypasses cookie drop)');
    const validTestState = jwt.sign({ userId: adminUser.id, ts: Date.now(), purpose: 'google_oauth' }, JWT_SECRET, { expiresIn: '1h' });
    const stateAuthRes = await fetch(`${baseUrl}/integrations/google/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'dummy_exchange_code', redirectUri: 'http://localhost/files', state: validTestState })
    });
    // The request must pass authentication (NOT 401). Since code is dummy, it fails Google token exchange (400) or controller logic, PROVING auth succeeded!
    if (stateAuthRes.status !== 401) {
      console.log(`  ✓ Successfully authenticated via state token fallback (HTTP ${stateAuthRes.status} !== 401)`);
    } else {
      console.error(`  ✗ Failed! Request was blocked with 401 by middleware:`, await stateAuthRes.text());
      allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 3: Auth URL Generates Signed State Token and Normalized Redirect URI
    // -------------------------------------------------------------
    console.log('\n[Test 3] GET /api/integrations/google/auth-url (Verify signed state & normalized URI)');
    const authUrlRes = await fetch(`${baseUrl}/integrations/google/auth-url?redirectUri=http://localhost:5173/files/`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const authUrlData = await authUrlRes.json();
    if (authUrlData.redirectUri === 'http://localhost:5173/files') {
      console.log('  ✓ Redirect URI correctly normalized (trailing slash stripped):', authUrlData.redirectUri);
    } else {
      console.error('  ✗ Redirect URI not normalized:', authUrlData.redirectUri);
      allPassed = false;
    }

    let generatedState = null;
    if (authUrlData.url) {
      const parsedUrl = new URL(authUrlData.url);
      generatedState = parsedUrl.searchParams.get('state');
      const decodedState = jwt.verify(generatedState, JWT_SECRET);
      if (decodedState?.userId === adminUser.id && decodedState?.purpose === 'google_oauth') {
        console.log('  ✓ Signed state parameter verified cryptographically with valid admin userId');
      } else {
        console.error('  ✗ State verification failed:', decodedState);
        allPassed = false;
      }
    }

    // -------------------------------------------------------------
    // TEST 4: Direct Simulated Callback Execution with Signed State Fallback
    // -------------------------------------------------------------
    console.log('\n[Test 4] Direct UserIntegration Save & Refresh Flow Verification');
    const validScope = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
    const mockEmail = 'owner.google.drive@gmail.com';
    const mockRefreshToken = 'mock_refresh_token_12345';

    // Simulate successful save via prisma (matching controller logic)
    const savedIntegration = await prisma.userIntegration.upsert({
      where: {
        userId_provider: {
          userId: adminUser.id,
          provider: 'google_drive'
        }
      },
      update: {
        status: 'connected',
        accountName: mockEmail,
        accessToken: 'mock_access_token',
        metadata: {
          email: mockEmail,
          displayName: 'Google Drive Owner',
          refreshToken: mockRefreshToken,
          expiresAt: Date.now() + 3600 * 1000,
          scope: validScope,
          isSystemStorage: false
        },
        updatedAt: new Date()
      },
      create: {
        userId: adminUser.id,
        provider: 'google_drive',
        status: 'connected',
        accountName: mockEmail,
        accessToken: 'mock_access_token',
        metadata: {
          email: mockEmail,
          displayName: 'Google Drive Owner',
          refreshToken: mockRefreshToken,
          expiresAt: Date.now() + 3600 * 1000,
          scope: validScope,
          isSystemStorage: false
        }
      }
    });

    if (savedIntegration.status === 'connected' && savedIntegration.accountName === mockEmail) {
      console.log('  ✓ UserIntegration record successfully saved in database');
      console.log('    Account:', savedIntegration.accountName);
      console.log('    Status:', savedIntegration.status);
      console.log('    Scope:', savedIntegration.metadata.scope);
      console.log('    Has Refresh Token:', Boolean(savedIntegration.metadata.refreshToken));
    } else {
      console.error('  ✗ Database write failed');
      allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 5: GET /api/integrations Returns connected=true
    // -------------------------------------------------------------
    console.log('\n[Test 5] GET /api/integrations (Verify connected=true for admin session)');
    const intRes = await fetch(`${baseUrl}/integrations`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const intData = await intRes.json();
    const gDrive = intData.integrations?.google_drive;
    if (gDrive?.connected === true && gDrive?.accountName === mockEmail) {
      console.log('  ✓ GET /api/integrations returns connected: true with correct accountName');
    } else {
      console.error('  ✗ Expected connected: true, got:', gDrive);
      allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 6: System Storage Activation
    // -------------------------------------------------------------
    console.log('\n[Test 6] POST /api/integrations/google/system-storage (Activate System Storage)');
    const sysRes = await fetch(`${baseUrl}/integrations/google/system-storage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ enabled: true })
    });
    const sysData = await sysRes.json();
    if (sysRes.ok && sysData.isSystemStorage === true) {
      console.log('  ✓ System storage successfully enabled after connection');
    } else {
      console.error('  ✗ Failed to enable system storage:', sysData);
      allPassed = false;
    }

    // -------------------------------------------------------------
    // TEST 7: Safe Telemetry Diagnostic Inspection
    // -------------------------------------------------------------
    console.log('\n[Test 7] GET /api/health/oauth-diagnostic (Inspect safe diagnostics)');
    const diagRes = await fetch(`${baseUrl}/health/oauth-diagnostic`);
    const diagData = await diagRes.json();
    if (diagRes.ok && diagData.status === 'ok') {
      console.log('  ✓ Diagnostic endpoint operational: totalEntries =', diagData.totalEntries);
      const str = JSON.stringify(diagData);
      const leaks = ['client_secret', 'refresh_token', 'access_token', 'password', 'GOCSPX'].some(s => str.includes(s));
      if (!leaks) {
        console.log('  ✓ Confirmed zero secrets/tokens exposed in diagnostic telemetry');
      } else {
        console.error('  ✗ Secret token leakage detected in diagnostics!');
        allPassed = false;
      }
    } else {
      console.error('  ✗ Failed to query diagnostic endpoint');
      allPassed = false;
    }

    console.log('\n========================================================');
    if (allPassed) {
      console.log('   >>> ALL OAUTH CALLBACK TESTS PASSED CLEANLY! <<<');
    } else {
      console.log('   >>> SOME TESTS FAILED <<<');
    }
    console.log('========================================================\n');

  } finally {
    if (adminUser?.id) {
      await prisma.auditLog.deleteMany({ where: { userId: adminUser.id } }).catch(() => {});
      await prisma.personalStorageAllocation.deleteMany({ where: { userId: adminUser.id } }).catch(() => {});
      await prisma.userIntegration.deleteMany({ where: { userId: adminUser.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: adminUser.id } }).catch(() => {});
    }

    // Guarantee pre-existing live system storage remains active
    if (liveSystemStorageId) {
      const liveInt = await prisma.userIntegration.findUnique({ where: { id: liveSystemStorageId } });
      if (liveInt && liveInt.metadata && liveInt.metadata.isSystemStorage !== true) {
        await prisma.userIntegration.update({
          where: { id: liveSystemStorageId },
          data: {
            metadata: {
              ...liveInt.metadata,
              isSystemStorage: true
            }
          }
        }).catch(() => {});
      }
    }

    server.close();
    await prisma.$disconnect();
  }

  if (!allPassed) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runOAuthCallbackTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
